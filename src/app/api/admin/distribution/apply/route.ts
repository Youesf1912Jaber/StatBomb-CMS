import { NextResponse } from "next/server";
import { planDistributionAssignment } from "@/lib/distribution-assignments";
import { fetchAllMatches } from "@/lib/match-master-preview";
import { persistReconciledDistributionPresence } from "@/lib/sync/persist-distribution-presence";
import { normalizeDistributionCollectorHrCode, normalizeDistributionHalf, normalizeDistributionTask, normalizeMatchId, readDistributionRowsForPreview } from "@/lib/sync/google-sheets";
import { createClient } from "@/lib/supabase/server";
import type { AssignmentRow } from "@/types/database.types";

export const runtime = "nodejs";

type ApplyResult = "inserted" | "existing" | "restored" | "conflict" | "error" | "missing";

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  let sourceRows: number[];
  try {
    const body = await request.json() as { sourceRows?: unknown };
    sourceRows = Array.isArray(body.sourceRows) && body.sourceRows.every(Number.isSafeInteger)
      ? [...new Set(body.sourceRows)]
      : [];
  } catch {
    sourceRows = [];
  }
  if (sourceRows.length === 0) return NextResponse.json({ error: "Select at least one Distribution row to apply." }, { status: 422 });

  try {
    const [rows, profilesResult, matches, assignmentsResult] = await Promise.all([
      readDistributionRowsForPreview(),
      supabase.from("profiles").select("*"),
      fetchAllMatches(supabase),
      supabase.from("assignments").select("*"),
    ]);
    if (profilesResult.error) throw profilesResult.error;
    if (assignmentsResult.error) throw assignmentsResult.error;

    const assignments: AssignmentRow[] = [...(assignmentsResult.data ?? [])];
    const results: Array<{ sourceRow: number; result: ApplyResult; assignmentId?: string; reason?: string }> = [];
    for (const sourceRow of sourceRows) {
      const row = rows.find((candidate) => candidate.raw_row_number === sourceRow);
      if (!row) {
        results.push({ sourceRow, result: "missing", reason: "Distribution row no longer exists." });
        continue;
      }
      const sourceConflict = rows.some((candidate) =>
        candidate.raw_row_number !== row.raw_row_number &&
        normalizeMatchId(candidate.match_id) === normalizeMatchId(row.match_id) &&
        normalizeDistributionTask(candidate.task) === normalizeDistributionTask(row.task) &&
        normalizeDistributionHalf(candidate.half) === normalizeDistributionHalf(row.half) &&
        normalizeDistributionCollectorHrCode(candidate.collector_hr_code) !== normalizeDistributionCollectorHrCode(row.collector_hr_code)
      );
      if (sourceConflict) {
        results.push({ sourceRow, result: "conflict", reason: "Distribution assigns this Match + Task + Half to different collectors." });
        continue;
      }
      const planned = planDistributionAssignment(row, profilesResult.data ?? [], matches, assignments);
      if (!planned.ok) {
        results.push({ sourceRow, result: planned.conflict ? "conflict" : "error", reason: planned.reason });
        continue;
      }
      const { plan } = planned;
      if (plan.existing) {
        results.push({
          sourceRow,
          result: plan.existing.distribution_present ? "existing" : "restored",
          assignmentId: plan.existing.id,
          reason: plan.existing.distribution_present
            ? "Matching assignment already exists and was reused."
            : "Matching assignment was restored from a previously missing Distribution row.",
        });
        continue;
      }
      const { data, error } = await supabase.rpc("create_assignment", {
        p_match_id: plan.match.id,
        p_collector_id: plan.collector.id,
        p_raw_task_value: plan.row.task ?? plan.task,
        p_task: plan.task,
        p_half: plan.half,
        p_sla: plan.sla,
        p_shift_date: plan.shiftDate,
      });
      if (error) {
        const duplicate = error.message.includes("DUPLICATE_LOGICAL_ASSIGNMENT");
        results.push({ sourceRow, result: duplicate ? "conflict" : "error", reason: duplicate ? "A concurrent logical-assignment conflict was detected." : "Unable to create assignment." });
        continue;
      }
      results.push({ sourceRow, result: "inserted", assignmentId: data.id });
      assignments.push(data);
    }

    const currentAssignments = await supabase.from("assignments").select("*");
    if (currentAssignments.error) throw currentAssignments.error;
    await persistReconciledDistributionPresence(supabase, {
      distributionRows: rows,
      assignments: currentAssignments.data ?? assignments,
      matches,
    });

    const counts = results.reduce<Record<ApplyResult, number>>(
      (result, item) => ({ ...result, [item.result]: result[item.result] + 1 }),
      { inserted: 0, existing: 0, restored: 0, conflict: 0, error: 0, missing: 0 },
    );
    return NextResponse.json({ results, counts });
  } catch (error) {
    console.error("Distribution apply failed", error);
    return NextResponse.json({ error: "Unable to apply Distribution assignments." }, { status: 500 });
  }
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { planDistributionAssignment } from "@/lib/distribution-assignments";
import { fetchAllMatches } from "@/lib/match-master-preview";
import { type DistributionMatchRow, readDistributionRowsForPreview } from "@/lib/sync/google-sheets";
import { distributionRowLogicalKey } from "@/lib/sync/reconcile";
import { persistReconciledDistributionPresence } from "@/lib/sync/persist-distribution-presence";
import type { AssignmentRow, Database, ProfileRow } from "@/types/database.types";

type Client = SupabaseClient<Database>;

export type DistributionAssignmentReconciliation = {
  inserted: number;
  updated: number;
  restored: number;
  present: number;
  missing: number;
  skipped: number;
};

async function createOrUpdateAssignment(
  supabase: Client,
  row: DistributionMatchRow,
  profiles: ProfileRow[],
  matches: Awaited<ReturnType<typeof fetchAllMatches>>,
  assignments: AssignmentRow[],
): Promise<"inserted" | "updated" | "restored" | "skipped"> {
  const planned = planDistributionAssignment(row, profiles, matches, assignments, {
    allowExistingCollectorUpdate: true,
  });
  if (!planned.ok) return "skipped";

  const { plan } = planned;
  if (!plan.existing) {
    const { data, error } = await supabase.rpc("create_assignment", {
      p_match_id: plan.match.id,
      p_collector_id: plan.collector.id,
      p_raw_task_value: plan.row.task ?? plan.task,
      p_task: plan.task,
      p_half: plan.half,
      p_sla: plan.sla,
      p_shift_date: plan.shiftDate,
    });
    if (error) throw error;
    assignments.push(data);
    return "inserted";
  }

  let assignment = plan.existing;
  let changed = false;
  if (assignment.collector_id !== plan.collector.id) {
    const { data, error } = await supabase.rpc("reassign_assignment", {
      p_assignment_id: assignment.id,
      p_new_collector_id: plan.collector.id,
      p_mode: "preserve",
    });
    if (error) throw error;
    assignment = data;
    changed = true;
  }

  if (assignment.sla !== plan.sla) {
    const { data, error } = await supabase.rpc("update_assignment", {
      p_assignment_id: assignment.id,
      p_task: assignment.task,
      p_half: assignment.half,
      p_sla: plan.sla,
      p_notes: assignment.notes,
    });
    if (error) throw error;
    assignment = data;
    changed = true;
  }

  if (assignment.shift_date !== plan.shiftDate) {
    const { data, error } = await supabase.rpc("update_distribution_details", {
      p_assignment_id: assignment.id,
      p_shift_date: plan.shiftDate,
      p_official_website_url: plan.match.official_website_url,
    });
    if (error) throw error;
    assignment = data;
    changed = true;
  }

  const index = assignments.findIndex((candidate) => candidate.id === assignment.id);
  if (index >= 0) assignments[index] = assignment;

  if (!plan.existing.distribution_present) return "restored";
  return changed ? "updated" : "skipped";
}

/**
 * Reconciles current Distribution sheet rows into the existing logical
 * assignment population, preserving execution history for reused rows.
 */
export async function reconcileDistributionAssignments(
  supabase: Client,
): Promise<DistributionAssignmentReconciliation> {
  const [distributionRows, profilesResult, matches, assignmentsResult] = await Promise.all([
    readDistributionRowsForPreview(),
    supabase.from("profiles").select("*"),
    fetchAllMatches(supabase),
    supabase.from("assignments").select("*"),
  ]);
  if (profilesResult.error) throw profilesResult.error;
  if (assignmentsResult.error) throw assignmentsResult.error;

  const assignments = [...(assignmentsResult.data ?? [])];
  const result: DistributionAssignmentReconciliation = {
    inserted: 0,
    updated: 0,
    restored: 0,
    present: 0,
    missing: 0,
    skipped: 0,
  };
  const logicalKeyCounts = new Map<string, number>();
  for (const row of distributionRows) {
    const logicalKey = distributionRowLogicalKey(row);
    if (logicalKey) {
      logicalKeyCounts.set(logicalKey, (logicalKeyCounts.get(logicalKey) ?? 0) + 1);
    }
  }

  for (const row of distributionRows) {
    const logicalKey = distributionRowLogicalKey(row);
    if (!logicalKey || logicalKeyCounts.get(logicalKey) !== 1) {
      result.skipped += 1;
      continue;
    }

    const outcome = await createOrUpdateAssignment(
      supabase,
      row,
      profilesResult.data ?? [],
      matches,
      assignments,
    );
    result[outcome] += 1;
  }

  const currentAssignments = await supabase.from("assignments").select("*");
  if (currentAssignments.error) throw currentAssignments.error;
  const presence = await persistReconciledDistributionPresence(supabase, {
    distributionRows,
    assignments: currentAssignments.data ?? assignments,
    matches,
  });

  result.present = presence.presentAssignmentIds.length;
  result.missing = presence.missingAssignmentIds.length;
  return result;
}

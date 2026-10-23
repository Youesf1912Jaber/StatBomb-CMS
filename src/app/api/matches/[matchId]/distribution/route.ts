import { NextResponse } from "next/server";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import { createDistributionAssignments, normalizeDistributionCollectorHrCode, normalizeDistributionHalf, normalizeDistributionTask, normalizeMatchId, pullTeamSheet, readDistributionRowsForMatch, readMatchesMasterSheet } from "@/lib/sync/google-sheets";
import { isAssignableCollectorTarget, planDistributionAssignment } from "@/lib/distribution-assignments";
import { fetchAllMatches, findMatchByExternalId } from "@/lib/match-master-preview";
import { persistReconciledDistributionPresence } from "@/lib/sync/persist-distribution-presence";
import { findAssignmentByLogicalKey } from "@/lib/sync/reconcile";
import { PreviewInputError } from "@/lib/sync/preview";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { AssignmentRow } from "@/types/database.types";
import { createOverTargetRecord } from "@/lib/over-target/create";
import {
  attachOverTargetsToAssignments,
  parseDistributionOverTargetFields,
  resolveOverTargetDistributionWeek,
  type ParsedDistributionOverTarget,
} from "@/lib/over-target/assignment-integration";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: { matchId: string } },
) {
  try {
    const profile = await getProfileOrRedirect();
    if (profile.role !== "admin") {
      return NextResponse.json({ success: false, error: "Admin access required." }, { status: 403 });
    }

    const normalizedMatchId = normalizeMatchId(params.matchId);
    if (!normalizedMatchId) {
      return NextResponse.json({ success: false, error: "Invalid Match ID." }, { status: 422 });
    }

    const matches = await readMatchesMasterSheet();
    const match = matches.find((row) => normalizeMatchId(row.match_id) === normalizedMatchId) ?? null;
    const distribution = await readDistributionRowsForMatch(normalizedMatchId);

    return NextResponse.json({
      success: true,
      matchId: normalizedMatchId,
      match,
      count: distribution.length,
      distribution,
    });
  } catch (error) {
    const message = error instanceof PreviewInputError
      ? error.safeMessage
      : "The Distribution sheet could not be read.";
    const status = error instanceof PreviewInputError ? 422 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { matchId: string } },
) {
  let distributionSaved = false;
  try {
    const profile = await getProfileOrRedirect();
    if (profile.role !== "admin") {
      return NextResponse.json({ success: false, error: "Admin access required." }, { status: 403 });
    }

    const normalizedMatchId = normalizeMatchId(params.matchId);
    if (!normalizedMatchId) {
      return NextResponse.json({ success: false, error: "Invalid Match ID." }, { status: 422 });
    }

    const body = await request.json() as {
      assignments?: Array<{
        collectorHrCode?: string;
        task?: string;
        half?: string;
        shiftDate?: string | null;
        overTarget?: boolean;
        overTargetCount?: number | null;
      }>;
    };
    if (!Array.isArray(body.assignments) || body.assignments.length === 0) {
      return NextResponse.json({ success: false, error: "Add at least one assignment before confirming." }, { status: 422 });
    }

    const matches = await readMatchesMasterSheet();
    const match = matches.find((row) => normalizeMatchId(row.match_id) === normalizedMatchId) ?? null;
    if (!match) {
      return NextResponse.json({ success: false, error: "The selected match could not be found in Match Master." }, { status: 404 });
    }

    const roster = await pullTeamSheet();
    const supabase = createClient();
    const [profilesResult, databaseMatches, assignmentsResult] = await Promise.all([
      supabase.from("profiles").select("*"),
      fetchAllMatches(supabase),
      supabase.from("assignments").select("*"),
    ]);
    if (profilesResult.error || assignmentsResult.error) {
      throw new PreviewInputError("Unable to validate assignment ownership and logical identity.");
    }
    const databaseMatch = findMatchByExternalId(databaseMatches, normalizedMatchId);
    if (!databaseMatch) {
      throw new PreviewInputError("The selected Match Master record is not available in Supabase.");
    }
    // Reconcile current sheet rows before validating a new distribution. Rows
    // deleted manually in Google Sheets may not yet be marked missing in Supabase.
    const existingSheetRows = await readDistributionRowsForMatch(normalizedMatchId);
    await persistReconciledDistributionPresence(supabase, {
      distributionRows: existingSheetRows,
      assignments: assignmentsResult.data ?? [],
      matches: databaseMatches,
      matchId: databaseMatch.id,
    });
    const { data: refreshedAssignments, error: refreshedAssignmentsError } = await supabase
      .from("assignments")
      .select("*");
    if (refreshedAssignmentsError) {
      throw new PreviewInputError("Unable to refresh assignment identity after reconciling the current Distribution sheet.");
    }
    const currentDatabaseAssignments = refreshedAssignments ?? [];

    const logicalKeys = new Set<string>();
    const overTargetFlags: ParsedDistributionOverTarget[] = [];
    const assignments = body.assignments.map((assignment) => {
      const collector = roster.find((candidate) => candidate.hr_code?.trim().toUpperCase() === assignment.collectorHrCode?.trim().toUpperCase());
      if (!collector || !collector.hr_code || !collector.full_name || !assignment.task || !assignment.half) {
        throw new PreviewInputError("Every assignment must use an active collector and include Task and Half.");
      }
      const hrCode = normalizeDistributionCollectorHrCode(collector.hr_code);
      const profileForHrCode = hrCode
        ? (profilesResult.data ?? []).find((candidate) => normalizeDistributionCollectorHrCode(candidate.hr_code) === hrCode)
        : undefined;
      if (!profileForHrCode || !isAssignableCollectorTarget(profileForHrCode)) {
        throw new PreviewInputError(`Collector ${collector.hr_code} is not an active Supabase collector.`);
      }
      const task = normalizeDistributionTask(assignment.task);
      const half = normalizeDistributionHalf(assignment.half);
      if (!task || !["Half 1", "Half 2", "Half 3", "Half 4", "Full Match"].includes(half)) {
        throw new PreviewInputError("Every assignment must include a valid task and half.");
      }
      const logicalKey = `${databaseMatch.id}|${task}|${half}`;
      if (logicalKeys.has(logicalKey)) {
        throw new PreviewInputError("The pending list contains a duplicate Match + Task + Half assignment.");
      }
      logicalKeys.add(logicalKey);
      const existing = findAssignmentByLogicalKey(currentDatabaseAssignments, databaseMatch.id, task, half);
      if (existing && existing.collector_id !== profileForHrCode.id && existing.distribution_present) {
        throw new PreviewInputError("This Match + Task + Half assignment belongs to a different collector.");
      }
      if (existing?.distribution_present) {
        throw new PreviewInputError("This Match + Task + Half assignment already exists.");
      }
      const overTargetParsed = parseDistributionOverTargetFields({
        overTarget: assignment.overTarget,
        overTargetCount: assignment.overTargetCount,
      });
      if (!overTargetParsed.ok) {
        throw new PreviewInputError(overTargetParsed.error);
      }
      overTargetFlags.push(overTargetParsed.value);
      return {
        matchId: normalizedMatchId,
        collectorHrCode: collector.hr_code,
        collectorName: collector.full_name,
        task: assignment.task,
        half: assignment.half,
        competitionName: match.competition_name,
        country: match.country,
        homeTeam: match.home_team,
        awayTeam: match.away_team,
        matchDate: match.match_date,
        kickOffTime: match.kick_off_time,
        shiftDate: assignment.shiftDate ?? null,
      };
    });
    const created = await createDistributionAssignments(assignments);
    distributionSaved = true;

    const persisted: AssignmentRow[] = [];
    const currentDistributionRows = await readDistributionRowsForMatch(normalizedMatchId);
    for (const sourceRow of created) {
      const source = currentDistributionRows.find((candidate) =>
        candidate.raw_row_number === sourceRow.raw_row_number &&
        normalizeDistributionCollectorHrCode(candidate.collector_hr_code) === normalizeDistributionCollectorHrCode(sourceRow.collector_hr_code) &&
        normalizeDistributionTask(candidate.task) === normalizeDistributionTask(sourceRow.task) &&
        normalizeDistributionHalf(candidate.half) === normalizeDistributionHalf(sourceRow.half)
      );
      if (!source) {
        return NextResponse.json({ success: false, error: "Distribution row saved, but assignment creation failed: the saved row could not be re-read." }, { status: 500 });
      }
      const currentAssignments = [...currentDatabaseAssignments.filter((assignment) => assignment.distribution_present), ...persisted];
      const planned = planDistributionAssignment(source, profilesResult.data ?? [], databaseMatches, currentAssignments);
      if (!planned.ok) {
        return NextResponse.json({ success: false, error: `Distribution row saved, but assignment creation failed: ${planned.reason}` }, { status: planned.conflict ? 409 : 422 });
      }
      if (planned.plan.existing) {
        persisted.push(planned.plan.existing);
        continue;
      }
      const { data, error } = await supabase.rpc("create_assignment", {
        p_match_id: planned.plan.match.id,
        p_collector_id: planned.plan.collector.id,
        p_raw_task_value: planned.plan.row.task ?? planned.plan.task,
        p_task: planned.plan.task,
        p_half: planned.plan.half,
        p_sla: planned.plan.sla,
        p_shift_date: planned.plan.shiftDate,
      });
      if (error) {
        const safeMessage = error.message.includes("DUPLICATE_LOGICAL_ASSIGNMENT")
          ? "A concurrent Match + Task + Half conflict was detected."
          : "The secure assignment RPC rejected the row.";
        return NextResponse.json({ success: false, error: `Distribution row saved, but assignment creation failed: ${safeMessage}` }, { status: error.message.includes("DUPLICATE_LOGICAL_ASSIGNMENT") ? 409 : 500 });
      }
      persisted.push(data);
    }
    await persistReconciledDistributionPresence(supabase, {
      distributionRows: currentDistributionRows,
      assignments: [...currentDatabaseAssignments, ...persisted],
      matches: databaseMatches,
      matchId: databaseMatch.id,
    });

    const overTargetClient = createServiceRoleClient();
    const attached = await attachOverTargetsToAssignments(
      persisted.map((assignment, index) => ({
        assignmentId: assignment.id,
        overTarget: overTargetFlags[index]?.overTarget === true,
        overTargetCount: overTargetFlags[index]?.overTargetCount ?? null,
      })),
      {
        weekDate: resolveOverTargetDistributionWeek(),
        createdBy: profile.id,
        create: (input) => createOverTargetRecord(overTargetClient, input),
      },
    );

    return NextResponse.json({
      success: true,
      matchId: normalizedMatchId,
      count: created.length,
      rows: created,
      assignments: persisted.map((assignment) => ({
        id: assignment.id,
        collector_id: assignment.collector_id,
        match_id: assignment.match_id,
        task: assignment.task,
        half: assignment.half,
        status: assignment.status,
      })),
      overTarget: attached.records.map((record) => ({
        id: record.id,
        assignment_id: record.assignment_id,
        count_value: record.count_value,
        week_date: record.week_date,
        week_date_raw: record.week_date_raw,
        done: record.done,
        sheet_sync_status: record.sheet_sync_status,
        last_sheet_error: record.last_sheet_error,
      })),
      warnings: attached.warnings,
      overTargetSheetFailed: attached.sheetFailed,
    });
  } catch (error) {
    const message = distributionSaved
      ? `Distribution row saved, but assignment creation failed: ${error instanceof PreviewInputError ? error.safeMessage : "an unexpected server error occurred."}`
      : error instanceof PreviewInputError
        ? error.safeMessage
        : "The Distribution row could not be created.";
    const status = error instanceof PreviewInputError ? 422 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

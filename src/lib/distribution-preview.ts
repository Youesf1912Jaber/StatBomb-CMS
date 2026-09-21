import "server-only";

import type { DistributionMatchRow } from "@/lib/sync/google-sheets";
import { normalizeDistributionCollectorHrCode, normalizeDistributionHalf, normalizeDistributionTask, normalizeMatchId } from "@/lib/sync/google-sheets";
import type { AssignmentRow, MatchRow, ProfileRow } from "@/types/database.types";

export type PreviewResult =
  | "NEW"
  | "EXISTING_UNCHANGED"
  | "EXISTING_DIFFERENT"
  | "INVALID_HR_CODE"
  | "ADMIN_HR_CODE"
  | "SUSPENDED_COLLECTOR"
  | "DELETED_COLLECTOR"
  | "MATCH_ID_MISSING"
  | "MATCH_NOT_FOUND"
  | "INVALID_TASK"
  | "INVALID_HALF"
  | "INVALID_SLA"
  | "LOGICAL_CONFLICT"
  | "DUPLICATE_SOURCE";

export type DistributionPreviewRow = {
  sourceRow: number;
  matchId: string;
  homeTeam: string | null;
  awayTeam: string | null;
  hrCode: string;
  collector: string | null;
  task: string;
  half: string;
  sourceStatus: string | null;
  sla: string | null;
  supabaseStatus: PreviewResult;
  reason: string;
  diagnostic?: string;
};

export type DistributionPreviewSummary = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  newAssignments: number;
  existingUnchanged: number;
  existingDifferent: number;
  duplicateSource: number;
  missingMatchIds: number;
  missingMatches: number;
  invalidHrCodes: number;
  adminHrCodes: number;
  suspendedCollectors: number;
  deletedCollectors: number;
};

function identity(matchId: string, hrCode: string, task: string, half: string): string {
  return `${matchId}|${hrCode}|${task.toLowerCase()}|${half.toLowerCase()}`;
}

const VALID_HALVES = new Set(["Half 1", "Half 2", "Half 3", "Half 4", "Full Match"]);

function validSla(value: string | null): boolean {
  return Boolean(value) && !Number.isNaN(new Date(value!).getTime());
}

function comparableShiftDate(value: string | null): string | null {
  const text = value?.trim() ?? "";
  if (!text) return null;
  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const dotMatch = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  const [, isoYear, isoMonth, isoDay] = isoMatch ?? [];
  const [, slashMonth, slashDay, slashYear] = slashMatch ?? [];
  const [, dotDay, dotMonth, dotYear] = dotMatch ?? [];
  const year = isoYear ?? slashYear ?? dotYear;
  const month = isoMonth ?? slashMonth ?? dotMonth;
  const day = isoDay ?? slashDay ?? dotDay;
  if (!year || !month || !day) return text.toLowerCase();
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function comparableFieldsMatch(row: DistributionMatchRow, assignment: AssignmentRow): boolean {
  const sourceShiftDate = comparableShiftDate(row.shift_date);
  const assignmentShiftDate = comparableShiftDate(assignment.shift_date);
  return sourceShiftDate === null || assignmentShiftDate === null || sourceShiftDate === assignmentShiftDate;
}

function relatedAssignmentDiagnostic(
  matchId: string,
  hrCode: string,
  task: string,
  half: string,
  assignments: AssignmentRow[],
  assignmentContext: Map<string, { matchId: string; hrCode: string }>,
): string | undefined {
  const related = assignments.some((assignment) => {
    const context = assignmentContext.get(assignment.id);
    if (!context || context.matchId !== matchId) return false;
    const assignmentTask = normalizeDistributionTask(assignment.task).toLowerCase();
    const assignmentHalf = normalizeDistributionHalf(assignment.half).toLowerCase();
    if (context.hrCode === hrCode && assignmentHalf === half.toLowerCase() && assignmentTask !== task.toLowerCase()) {
      return true;
    }
    if (assignmentTask === task.toLowerCase() && assignmentHalf === half.toLowerCase() && context.hrCode !== hrCode) {
      return true;
    }
    return context.hrCode === hrCode && assignmentTask === task.toLowerCase() && assignmentHalf !== half.toLowerCase();
  });
  if (!related) return undefined;
  const sameCollectorHalfDifferentTask = assignments.some((assignment) => {
    const context = assignmentContext.get(assignment.id);
    return context?.matchId === matchId &&
      context.hrCode === hrCode &&
      normalizeDistributionHalf(assignment.half).toLowerCase() === half.toLowerCase() &&
      normalizeDistributionTask(assignment.task).toLowerCase() !== task.toLowerCase();
  });
  if (sameCollectorHalfDifferentTask) return "RELATED_ASSIGNMENT_DIFFERENT_TASK";
  const sameTaskHalfDifferentCollector = assignments.some((assignment) => {
    const context = assignmentContext.get(assignment.id);
    return context?.matchId === matchId &&
      context.hrCode !== hrCode &&
      normalizeDistributionHalf(assignment.half).toLowerCase() === half.toLowerCase() &&
      normalizeDistributionTask(assignment.task).toLowerCase() === task.toLowerCase();
  });
  if (sameTaskHalfDifferentCollector) return "RELATED_ASSIGNMENT_DIFFERENT_COLLECTOR";
  return "RELATED_ASSIGNMENT_DIFFERENT_HALF";
}

export function classifyDistributionRows(
  rows: DistributionMatchRow[],
  profiles: ProfileRow[],
  matches: MatchRow[],
  assignments: AssignmentRow[],
): { rows: DistributionPreviewRow[]; summary: DistributionPreviewSummary } {
  const profilesByHr = new Map(
    profiles
      .filter((profile) => profile.hr_code)
      .map((profile) => [normalizeDistributionCollectorHrCode(profile.hr_code)!, profile]),
  );
  const matchesByExternalId = new Map(
    matches.map((match) => [normalizeMatchId(match.external_id)!, match]),
  );
  const matchesById = new Map(matches.map((match) => [match.id, normalizeMatchId(match.external_id) ?? ""]));
  const profilesById = new Map(profiles.map((profile) => [profile.id, normalizeDistributionCollectorHrCode(profile.hr_code) ?? ""]));
  const assignmentContext = new Map(assignments.map((assignment) => [
    assignment.id,
    {
      matchId: matchesById.get(assignment.match_id) ?? "",
      hrCode: profilesById.get(assignment.collector_id) ?? "",
    },
  ]));
  const assignmentsByIdentity = new Map<string, AssignmentRow>();
  for (const assignment of assignments) {
    const context = assignmentContext.get(assignment.id);
    if (!context) continue;
    assignmentsByIdentity.set(identity(
      context.matchId,
      context.hrCode,
      normalizeDistributionTask(assignment.task),
      normalizeDistributionHalf(assignment.half),
    ), assignment);
  }
  // The database logical identity intentionally excludes collector. Detect a
  // source-side disagreement before offering either row for application.
  const sourceCollectorsByLogicalKey = new Map<string, Set<string>>();
  for (const row of rows) {
    const matchId = normalizeMatchId(row.match_id) ?? "";
    const task = normalizeDistributionTask(row.task);
    const half = normalizeDistributionHalf(row.half);
    const hrCode = normalizeDistributionCollectorHrCode(row.collector_hr_code) ?? "";
    if (!matchId || !task || !VALID_HALVES.has(half) || !hrCode) continue;
    const key = `${matchId}|${task.toLowerCase()}|${half.toLowerCase()}`;
    const collectors = sourceCollectorsByLogicalKey.get(key) ?? new Set<string>();
    collectors.add(hrCode);
    sourceCollectorsByLogicalKey.set(key, collectors);
  }
  const seen = new Set<string>();
  const previewRows: DistributionPreviewRow[] = rows.map((row) => {
    const matchId = normalizeMatchId(row.match_id) ?? "";
    const hrCode = normalizeDistributionCollectorHrCode(row.collector_hr_code) ?? "";
    const task = normalizeDistributionTask(row.task);
    const half = normalizeDistributionHalf(row.half);
    const profile = hrCode ? profilesByHr.get(hrCode) : undefined;
    const match = matchId ? matchesByExternalId.get(matchId) : undefined;
    let supabaseStatus: PreviewResult;
    let reason: string;
    let diagnostic: string | undefined;
    if (!matchId) {
      supabaseStatus = "MATCH_ID_MISSING";
      reason = "Distribution row has no Match ID.";
    } else if (!match) {
      supabaseStatus = "MATCH_NOT_FOUND";
      reason = "Match ID was not found in Supabase matches.";
    } else if (!hrCode || !profile) {
      supabaseStatus = "INVALID_HR_CODE";
      reason = "HR-Code does not resolve to a Supabase profile.";
    } else if (profile.role === "admin") {
      supabaseStatus = "ADMIN_HR_CODE";
      reason = "HR-Code resolves to an Admin profile.";
    } else if (profile.deleted_at) {
      supabaseStatus = "DELETED_COLLECTOR";
      reason = "Collector profile is deleted.";
    } else if (profile.suspended_at) {
      supabaseStatus = "SUSPENDED_COLLECTOR";
      reason = "Collector profile is suspended.";
    } else if (!task) {
      supabaseStatus = "INVALID_TASK";
      reason = "Distribution task is required.";
    } else if (!VALID_HALVES.has(half)) {
      supabaseStatus = "INVALID_HALF";
      reason = "Distribution half is invalid.";
    } else if (!validSla(row.sla)) {
      supabaseStatus = "INVALID_SLA";
      reason = "Distribution SLA must be a valid date/time.";
    } else {
      const key = identity(matchId, hrCode, task, half);
      const logicalKey = `${matchId}|${task.toLowerCase()}|${half.toLowerCase()}`;
      const logicalExisting = assignments.find((assignment) =>
        assignment.match_id === match.id && assignment.task === task && assignment.half === half
      );
      if (seen.has(key)) {
        supabaseStatus = "DUPLICATE_SOURCE";
        reason = "The same operational identity appears more than once in Distribution.";
      } else if ((sourceCollectorsByLogicalKey.get(logicalKey)?.size ?? 0) > 1) {
        supabaseStatus = "LOGICAL_CONFLICT";
        reason = "Distribution assigns this Match + Task + Half to different collectors.";
      } else if (logicalExisting && logicalExisting.collector_id !== profile.id) {
        supabaseStatus = "LOGICAL_CONFLICT";
        reason = "A different collector already owns this Match + Task + Half assignment.";
      } else {
        seen.add(key);
        const existing = assignmentsByIdentity.get(key);
        if (!existing) {
          supabaseStatus = "NEW";
          diagnostic = relatedAssignmentDiagnostic(matchId, hrCode, task, half, assignments, assignmentContext);
          reason = diagnostic
            ? `No exact assignment exists; ${diagnostic}.`
            : "No matching Supabase assignment exists.";
        } else if (!comparableFieldsMatch(row, existing)) {
          supabaseStatus = "EXISTING_DIFFERENT";
          reason = "The exact assignment identity exists, but a comparable shift date differs.";
        } else {
          supabaseStatus = "EXISTING_UNCHANGED";
          reason = "Matching assignment exists with equivalent operational and comparable fields.";
        }
      }
    }
    return {
      sourceRow: row.raw_row_number,
      matchId,
      homeTeam: match?.home_team ?? null,
      awayTeam: match?.away_team ?? null,
      hrCode,
      collector: profile?.full_name ?? row.collector_name,
      task,
      half,
      sourceStatus: row.status,
      sla: row.sla,
      supabaseStatus,
      reason,
      ...(diagnostic ? { diagnostic } : {}),
    };
  });
  const summary = previewRows.reduce<DistributionPreviewSummary>((result, row) => {
    result.totalRows += 1;
    if (row.supabaseStatus === "NEW") result.newAssignments += 1;
    if (row.supabaseStatus === "EXISTING_UNCHANGED") result.existingUnchanged += 1;
    if (row.supabaseStatus === "EXISTING_DIFFERENT") result.existingDifferent += 1;
    if (row.supabaseStatus === "DUPLICATE_SOURCE") result.duplicateSource += 1;
    if (row.supabaseStatus === "MATCH_ID_MISSING") result.missingMatchIds += 1;
    if (row.supabaseStatus === "MATCH_NOT_FOUND") result.missingMatches += 1;
    if (row.supabaseStatus === "INVALID_HR_CODE") result.invalidHrCodes += 1;
    if (row.supabaseStatus === "ADMIN_HR_CODE") result.adminHrCodes += 1;
    if (row.supabaseStatus === "SUSPENDED_COLLECTOR") result.suspendedCollectors += 1;
    if (row.supabaseStatus === "DELETED_COLLECTOR") result.deletedCollectors += 1;
    if (["NEW", "EXISTING_UNCHANGED", "EXISTING_DIFFERENT", "DUPLICATE_SOURCE"].includes(row.supabaseStatus)) {
      result.validRows += 1;
    } else {
      result.invalidRows += 1;
    }
    return result;
  }, {
    totalRows: 0, validRows: 0, invalidRows: 0, newAssignments: 0,
    existingUnchanged: 0, existingDifferent: 0, duplicateSource: 0,
    missingMatchIds: 0, missingMatches: 0, invalidHrCodes: 0,
    adminHrCodes: 0, suspendedCollectors: 0, deletedCollectors: 0,
  });
  return { rows: previewRows, summary };
}

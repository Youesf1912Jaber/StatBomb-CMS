import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { planDistributionAssignment } from "@/lib/distribution-assignments";
import { fetchAllMatches } from "@/lib/match-master-preview";
import { normalizeDistributionCollectorHrCode, normalizeMatchId, normalizeDistributionTask, normalizeDistributionHalf, type DistributionMatchRow, readDistributionRowsForPreview } from "@/lib/sync/google-sheets";
import { assignmentLogicalKey, distributionRowLogicalKey } from "@/lib/sync/reconcile";
import { persistReconciledDistributionPresence } from "@/lib/sync/persist-distribution-presence";
import type { AssignmentRow, AssignmentStatus, Database, ProfileRow } from "@/types/database.types";

type Client = SupabaseClient<Database>;

const ASSIGNMENTS_PAGE_SIZE = 1000;

async function fetchAllAssignments(client: Client): Promise<AssignmentRow[]> {
  const rows: AssignmentRow[] = [];
  for (let from = 0; ; from += ASSIGNMENTS_PAGE_SIZE) {
    const { data, error } = await client
      .from("assignments")
      .select("*")
      .order("id", { ascending: true })
      .range(from, from + ASSIGNMENTS_PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < ASSIGNMENTS_PAGE_SIZE) break;
  }
  return rows;
}

export type DistributionAssignmentReconciliation = {
  inserted: number;
  updated: number;
  restored: number;
  present: number;
  missing: number;
  skipped: number;
  skippedReasons: Record<string, number>;
};

type RpcErrorFields = {
  message: string;
  code: string;
  details: string;
  hint: string;
};

function fieldText(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

function rpcErrorFields(error: unknown): RpcErrorFields {
  const candidate = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  return {
    message: fieldText(candidate.message),
    code: fieldText(candidate.code),
    details: fieldText(candidate.details),
    hint: fieldText(candidate.hint),
  };
}

const SECRET_PATTERN =
  /(?:postgres(?:ql)?:\/\/|mongodb(?:\+srv)?:\/\/)\S+|(?:bearer\s+)[a-z0-9._\-]+|(?:(?:api[_-]?key|secret|password|token|authorization|private[_-]?key)\s*[:=]\s*)\S+|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]+|-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/gi;

function sanitizeDiagnosticText(value: string): string {
  return value.replace(SECRET_PATTERN, "[redacted]").replace(/\s+/g, " ").trim().slice(0, 400);
}

export class DistributionRefreshRpcError extends Error {
  readonly raw_row_number: number;
  readonly match_id: string;
  readonly collector_hr_code: string | null;
  readonly task: string | null;
  readonly half: string | null;
  readonly operation: string;
  readonly rpcMessage: string;
  readonly rpcCode: string;
  readonly rpcDetails: string;
  readonly rpcHint: string;
  readonly originalError: unknown;
  readonly safeMessage: string;

  constructor(row: DistributionMatchRow, operation: string, error: unknown) {
    const rpc = rpcErrorFields(error);
    const safeMessage = [
      "Unable to refresh Distribution.",
      `row=${row.raw_row_number}`,
      `match_id=${sanitizeDiagnosticText(row.match_id)}`,
      `hr_code=${sanitizeDiagnosticText(row.collector_hr_code ?? "")}`,
      `task=${sanitizeDiagnosticText(row.task ?? "")}`,
      `half=${sanitizeDiagnosticText(row.half ?? "")}`,
      `operation=${operation}`,
      rpc.code ? `code=${sanitizeDiagnosticText(rpc.code)}` : "",
      rpc.message ? `message=${sanitizeDiagnosticText(rpc.message)}` : "",
      rpc.details ? `details=${sanitizeDiagnosticText(rpc.details)}` : "",
      rpc.hint ? `hint=${sanitizeDiagnosticText(rpc.hint)}` : "",
    ].filter(Boolean).join(" ");
    super(safeMessage);
    this.name = "DistributionRefreshRpcError";
    this.raw_row_number = row.raw_row_number;
    this.match_id = row.match_id;
    this.collector_hr_code = row.collector_hr_code;
    this.task = row.task;
    this.half = row.half;
    this.operation = operation;
    this.rpcMessage = rpc.message;
    this.rpcCode = rpc.code;
    this.rpcDetails = rpc.details;
    this.rpcHint = rpc.hint;
    this.originalError = error;
    this.safeMessage = safeMessage;
    this.cause = error;
  }
}

function throwRpcError(row: DistributionMatchRow, operation: string, error: unknown): never {
  const rpc = rpcErrorFields(error);
  const diagnostic = new DistributionRefreshRpcError(row, operation, error);
  console.error("Distribution assignment RPC failed", {
    raw_row_number: row.raw_row_number,
    match_id: row.match_id,
    collector_hr_code: row.collector_hr_code,
    task: row.task,
    half: row.half,
    operation,
    message: rpc.message,
    code: rpc.code,
    details: rpc.details,
    hint: rpc.hint,
    originalError: error,
  });
  throw diagnostic;
}

function assignmentStatusFromDistribution(value: string | null): AssignmentStatus | null {
  const normalized = (value ?? "").trim().toLowerCase().replace(/\\s+/g, " ");
  if (!normalized) return "Not Started";
  if (normalized === "complete" || normalized === "completed") return "Completed";
  if (normalized === "in progress" || normalized === "in-progress") return "In Progress";
  if (normalized === "not started" || normalized === "not-started") return "Not Started";
  // Leave unfamiliar sheet values alone instead of accidentally resetting an assignment.
  return null;
}

async function syncAssignmentStatusFromDistribution(
  supabase: Client,
  assignment: AssignmentRow,
  row: DistributionMatchRow,
): Promise<{ assignment: AssignmentRow; changed: boolean }> {
  const desiredStatus = assignmentStatusFromDistribution(row.status);
  if (!desiredStatus || assignment.status === desiredStatus) {
    return { assignment, changed: false };
  }

  // The refresh route is admin-authenticated, but the caller's anon-key client
  // may be blocked by assignment UPDATE RLS policies. Use the server-only
  // service-role client for this narrowly scoped, server-validated sync write.
  const serviceClient = createServiceRoleClient();
  const now = new Date().toISOString();
  const statusFields = desiredStatus === "Completed"
    ? { status: desiredStatus, completed_at: assignment.completed_at ?? now, started_at: assignment.started_at ?? now }
    : desiredStatus === "In Progress"
      ? { status: desiredStatus, completed_at: null, started_at: assignment.started_at ?? now }
      : { status: desiredStatus, completed_at: null, started_at: null };
  const { data, error } = await serviceClient
    .from("assignments")
    .update(statusFields)
    .eq("id", assignment.id)
    .select("*")
    .maybeSingle();
  if (error) throw error;

  // A row can disappear between reconciliation's initial read and this write.
  // Do not fail the entire Distribution refresh for that race; the next refresh
  // will reconcile the current set of rows again.
  if (!data) {
    console.warn("Distribution status sync skipped: assignment no longer exists", {
      assignmentId: assignment.id,
      matchId: row.match_id,
    });
    return { assignment, changed: false };
  }

  return { assignment: data, changed: true };
}

async function createOrUpdateAssignment(
  supabase: Client,
  row: DistributionMatchRow,
  profiles: ProfileRow[],
  matches: Awaited<ReturnType<typeof fetchAllMatches>>,
  assignments: AssignmentRow[],
  skippedReasons: Record<string, number>,
  allowExistingCollectorUpdate: boolean,
  assignmentOverride: AssignmentRow | null = null,
): Promise<"inserted" | "updated" | "restored" | "skipped"> {
  const planned = planDistributionAssignment(row, profiles, matches, assignments, {
    allowExistingCollectorUpdate,
  });
  if (!planned.ok) {
    const reason = planned.reason.startsWith("Match ID was not found")
      ? "match_not_found"
      : planned.reason.startsWith("HR-Code does not resolve")
        ? "collector_not_found_or_inactive"
        : planned.reason.startsWith("Distribution SLA")
          ? "invalid_sla"
          : planned.reason.startsWith("Distribution row has no valid Match ID")
            ? "invalid_match_id"
            : planned.reason.startsWith("Distribution task")
              ? "missing_task"
              : planned.reason.startsWith("Distribution half")
                ? "invalid_half"
                : "invalid_assignment";
    skippedReasons[reason] = (skippedReasons[reason] ?? 0) + 1;
    return "skipped";
  }

  const plan = planned.plan.existing || !assignmentOverride
    ? planned.plan
    : { ...planned.plan, existing: assignmentOverride };
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
    if (error) throwRpcError(row, "create_assignment", error);
    const statusSync = await syncAssignmentStatusFromDistribution(supabase, data, row);
    assignments.push(statusSync.assignment);
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
    if (error) throwRpcError(row, "reassign_assignment", error);
    assignment = data;
    changed = true;
  }

  if (assignment.task !== plan.task || assignment.half !== plan.half || assignment.sla !== plan.sla) {
    const { data, error } = await supabase.rpc("update_assignment", {
      p_assignment_id: assignment.id,
      p_task: plan.task,
      p_half: plan.half,
      p_sla: plan.sla,
      p_notes: assignment.notes,
    });
    if (error) throwRpcError(row, "update_assignment", error);
    assignment = data;
    changed = true;
  }

  if (assignment.shift_date !== plan.shiftDate) {
    const { data, error } = await supabase.rpc("update_distribution_details", {
      p_assignment_id: assignment.id,
      p_shift_date: plan.shiftDate,
      p_official_website_url: plan.match.official_website_url,
    });
    if (error) throwRpcError(row, "update_distribution_details", error);
    assignment = data;
    changed = true;
  }

  // Distribution's Status cell is the source of truth during refresh:
  // Complete -> Completed, In Progress -> In Progress, blank -> Not Started.
  const statusSync = await syncAssignmentStatusFromDistribution(supabase, assignment, row);
  assignment = statusSync.assignment;
  changed = changed || statusSync.changed;

  const index = assignments.findIndex((candidate) => candidate.id === assignment.id);
  if (index >= 0) assignments[index] = assignment;

  if (!plan.existing.distribution_present) return "restored";
  if (!changed) skippedReasons.already_up_to_date = (skippedReasons.already_up_to_date ?? 0) + 1;
  return changed ? "updated" : "skipped";
}

/**
 * Reconciles current Distribution sheet rows into the existing logical
 * assignment population, preserving execution history for reused rows.
 */
export async function reconcileDistributionAssignments(
  supabase: Client,
): Promise<DistributionAssignmentReconciliation> {
  const [distributionRows, profilesResult, matches, loadedAssignments] = await Promise.all([
    readDistributionRowsForPreview(),
    supabase.from("profiles").select("*"),
    fetchAllMatches(supabase),
    fetchAllAssignments(supabase),
  ]);
  if (profilesResult.error) throw profilesResult.error;

  const assignments = [...loadedAssignments];
  const result: DistributionAssignmentReconciliation = {
    inserted: 0,
    updated: 0,
    restored: 0,
    present: 0,
    missing: 0,
    skipped: 0,
    skippedReasons: {},
  };
  const logicalKeyCounts = new Map<string, number>();
  const rowKeyCounts = new Map<string, number>();
  for (const row of distributionRows) {
    const logicalKey = distributionRowLogicalKey(row);
    if (logicalKey) {
      logicalKeyCounts.set(logicalKey, (logicalKeyCounts.get(logicalKey) ?? 0) + 1);
      const hrCode = normalizeDistributionCollectorHrCode(row.collector_hr_code);
      const rowKey = hrCode ? `${logicalKey}|${hrCode}` : null;
      if (rowKey) rowKeyCounts.set(rowKey, (rowKeyCounts.get(rowKey) ?? 0) + 1);
    }
  }

  // The database intentionally enforces one assignment per Match + Task + Half.
  // When the Sheet contains competing rows for that identity, only process the
  // row belonging to the already-assigned collector. If no current assignment
  // disambiguates the rows, skip them rather than arbitrarily assigning a
  // collector or crashing the entire refresh with a unique-constraint error.
  const matchesById = new Map(matches.map((match) => [match.id, match] as const));
  const assignmentsByLogicalKey = new Map<string, AssignmentRow>();
  for (const assignment of assignments) {
    const match = matchesById.get(assignment.match_id);
    if (!match) continue;
    const key = assignmentLogicalKey(assignment, String(match.external_id));
    if (key) assignmentsByLogicalKey.set(key, assignment);
  }

  const RECONCILIATION_BATCH_SIZE = 8;
  const eligibleRows: DistributionMatchRow[] = [];
  const assignmentOverridesByRowNumber = new Map<number, AssignmentRow>();
  const rowCountsByMatchCollector = new Map<string, number>();
  const assignmentsByMatchCollector = new Map<string, AssignmentRow[]>();
  const profiles = profilesResult.data ?? [];
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile] as const));
  const profilesByHrCode = new Map(
    profiles.flatMap((profile) => {
      const code = normalizeDistributionCollectorHrCode(profile.hr_code);
      return code ? [[code, profile] as const] : [];
    }),
  );
  const matchesByExternalId = new Map(
    matches.flatMap((match) => {
      const id = normalizeMatchId(match.external_id);
      return id ? [[id, match] as const] : [];
    }),
  );
  for (const row of distributionRows) {
    const matchId = normalizeMatchId(row.match_id);
    const hrCode = normalizeDistributionCollectorHrCode(row.collector_hr_code);
    if (!matchId || !hrCode) continue;
    const key = `${matchId}|${hrCode}`;
    rowCountsByMatchCollector.set(key, (rowCountsByMatchCollector.get(key) ?? 0) + 1);
  }
  for (const assignment of assignments) {
    const match = matchesById.get(assignment.match_id);
    const profile = profilesById.get(assignment.collector_id);
    const matchId = match ? normalizeMatchId(match.external_id) : null;
    const hrCode = normalizeDistributionCollectorHrCode(profile?.hr_code);
    if (!matchId || !hrCode) continue;
    const key = `${matchId}|${hrCode}`;
    assignmentsByMatchCollector.set(key, [...(assignmentsByMatchCollector.get(key) ?? []), assignment]);
  }
  const handledAmbiguousKeys = new Set<string>();
  for (const row of distributionRows) {
    const logicalKey = distributionRowLogicalKey(row);
    const hrCode = normalizeDistributionCollectorHrCode(row.collector_hr_code);
    if (!logicalKey || !hrCode) {
      result.skipped += 1;
      result.skippedReasons.invalid_identity = (result.skippedReasons.invalid_identity ?? 0) + 1;
      continue;
    }
    const rowKey = `${logicalKey}|${hrCode}`;
    if (rowKeyCounts.get(rowKey) !== 1) {
      result.skipped += 1;
      result.skippedReasons.duplicate_same_collector_row = (result.skippedReasons.duplicate_same_collector_row ?? 0) + 1;
      continue;
    }

    if ((logicalKeyCounts.get(logicalKey) ?? 0) > 1) {
      if (handledAmbiguousKeys.has(logicalKey)) continue;
      handledAmbiguousKeys.add(logicalKey);
      const existing = assignmentsByLogicalKey.get(logicalKey);
      const existingProfile = existing
        ? (profilesResult.data ?? []).find((profile) => profile.id === existing.collector_id)
        : undefined;
      const existingHrCode = normalizeDistributionCollectorHrCode(existingProfile?.hr_code);
      const candidates = distributionRows.filter((candidate) =>
        distributionRowLogicalKey(candidate) === logicalKey &&
        normalizeDistributionCollectorHrCode(candidate.collector_hr_code) !== null
      );
      const matchingRows = existingHrCode
        ? candidates.filter((candidate) =>
            normalizeDistributionCollectorHrCode(candidate.collector_hr_code) === existingHrCode
          )
        : [];
      const matchingRow = matchingRows[0];
      if (matchingRows.length === 1 && matchingRow) {
        eligibleRows.push(matchingRow);
        result.skipped += candidates.length - 1;
        result.skippedReasons.duplicate_logical_assignment =
          (result.skippedReasons.duplicate_logical_assignment ?? 0) + candidates.length - 1;
      } else {
        result.skipped += candidates.length;
        result.skippedReasons.duplicate_logical_assignment =
          (result.skippedReasons.duplicate_logical_assignment ?? 0) + candidates.length;
      }
      continue;
    }

    const matchId = normalizeMatchId(row.match_id);
    const rowHrCode = normalizeDistributionCollectorHrCode(row.collector_hr_code);
    const profile = rowHrCode ? profilesByHrCode.get(rowHrCode) : undefined;
    const match = matchId ? matchesByExternalId.get(matchId) : undefined;
    if (match && profile && matchId && rowHrCode && !assignmentsByLogicalKey.has(logicalKey)) {
      const matchCollectorKey = `${matchId}|${rowHrCode}`;
      const existingForCollector = assignmentsByMatchCollector.get(matchCollectorKey) ?? [];
      const targetConflict = assignments.some((candidate) =>
        candidate.match_id === match.id &&
        candidate.task === normalizeDistributionTask(row.task) &&
        candidate.half === normalizeDistributionHalf(row.half) &&
        !existingForCollector.some((existing) => existing.id === candidate.id)
      );
      if (
        rowCountsByMatchCollector.get(matchCollectorKey) === 1 &&
        existingForCollector.length === 1 &&
        !targetConflict
      ) {
        const existingAssignment = existingForCollector[0];
        if (existingAssignment) assignmentOverridesByRowNumber.set(row.raw_row_number, existingAssignment);
      }
    }
    eligibleRows.push(row);
  }

  for (let offset = 0; offset < eligibleRows.length; offset += RECONCILIATION_BATCH_SIZE) {
    const batch = eligibleRows.slice(offset, offset + RECONCILIATION_BATCH_SIZE);
    const outcomes = await Promise.allSettled(batch.map((row) =>
      createOrUpdateAssignment(
        supabase,
        row,
        profilesResult.data ?? [],
        matches,
        assignments,
        result.skippedReasons,
        (logicalKeyCounts.get(distributionRowLogicalKey(row) ?? "") ?? 0) === 1,
        assignmentOverridesByRowNumber.get(row.raw_row_number) ?? null,
      )
    ));

    let firstError: unknown;
    for (const outcome of outcomes) {
      if (outcome.status === "fulfilled") {
        result[outcome.value] += 1;
      } else if (firstError === undefined) {
        firstError = outcome.reason;
      }
    }
    if (firstError !== undefined) throw firstError;
  }

  const currentAssignments = await fetchAllAssignments(supabase);
  const presence = await persistReconciledDistributionPresence(supabase, {
    distributionRows,
    assignments: currentAssignments,
    matches,
    profiles: profilesResult.data ?? [],
  });

  result.present = presence.presentAssignmentIds.length;
  result.missing = presence.missingAssignmentIds.length;
  return result;
}

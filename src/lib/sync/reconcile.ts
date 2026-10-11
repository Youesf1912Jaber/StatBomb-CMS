import {
  canonicalizeDistributionTask,
  logicalAssignmentKey as buildLogicalAssignmentKey,
  normalizeDistributionHalf,
  normalizeMatchId,
  VALID_ASSIGNMENT_HALVES,
} from "@/lib/sync/distribution-identity";
import type { AssignmentRow, MatchRow } from "@/types/database.types";

type DistributionIdentityRow = {
  match_id: string;
  task: string | null;
  half: string | null;
};

export type DistributionLogicalKey = string;

export type ReconciliationAssignment = {
  assignment: AssignmentRow;
  matchExternalId: string;
  key: DistributionLogicalKey;
};

export type DistributionReconciliation = {
  presentAssignmentIds: string[];
  missingAssignmentIds: string[];
  restoredAssignmentIds: string[];
  unchangedPresentAssignmentIds: string[];
  unchangedMissingAssignmentIds: string[];
  presentKeys: DistributionLogicalKey[];
  assignmentsByKey: Map<DistributionLogicalKey, ReconciliationAssignment>;
};

function normalizeHalf(value: string | null | undefined): string {
  return normalizeDistributionHalf(value ?? "");
}

function canonicalizeTask(value: string | null | undefined): string {
  return canonicalizeDistributionTask(value ?? "");
}

export function logicalAssignmentKey(
  matchExternalId: string,
  task: string,
  half: string,
): DistributionLogicalKey {
  return buildLogicalAssignmentKey(matchExternalId, task, half);
}

export function distributionRowLogicalKey(row: DistributionIdentityRow): DistributionLogicalKey | null {
  const matchId = normalizeMatchId(row.match_id);
  const task = canonicalizeTask(row.task);
  const half = normalizeHalf(row.half);
  if (!matchId || !task || !VALID_ASSIGNMENT_HALVES.has(half)) return null;
  return logicalAssignmentKey(matchId, task, half);
}

export function assignmentLogicalKey(
  assignment: Pick<AssignmentRow, "task" | "half" | "raw_task_value">,
  matchExternalId: string,
): DistributionLogicalKey | null {
  const matchId = normalizeMatchId(matchExternalId);
  const task = canonicalizeTask(assignment.task) || canonicalizeTask(assignment.raw_task_value);
  const half = normalizeHalf(assignment.half);
  if (!matchId || !task || !VALID_ASSIGNMENT_HALVES.has(half)) return null;
  return logicalAssignmentKey(matchId, task, half);
}

export function currentDistributionKeys(rows: DistributionIdentityRow[]): Set<DistributionLogicalKey> {
  const keys = new Set<DistributionLogicalKey>();
  for (const row of rows) {
    const key = distributionRowLogicalKey(row);
    if (key) keys.add(key);
  }
  return keys;
}

export function matchHasCurrentDistribution(
  matchExternalId: string,
  rows: DistributionIdentityRow[],
): boolean {
  const matchId = normalizeMatchId(matchExternalId);
  if (!matchId) return false;
  return rows.some((row) => normalizeMatchId(row.match_id) === matchId);
}

export function findAssignmentByLogicalKey(
  assignments: AssignmentRow[],
  matchId: string,
  task: string,
  half: string,
  collectorId?: string,
  allowCollectorChange = true,
): AssignmentRow | undefined {
  const canonicalTask = canonicalizeTask(task);
  const normalizedHalf = normalizeHalf(half);
  const candidates = assignments.filter((candidate) =>
    candidate.match_id === matchId &&
    (
      canonicalizeTask(candidate.task) === canonicalTask ||
      canonicalizeTask(candidate.raw_task_value) === canonicalTask
    ) &&
    normalizeHalf(candidate.half) === normalizedHalf
  );

  // Match the same collector first. A match can legitimately be assigned to
  // multiple collectors for the same task/half, so never grab another
  // collector's row just because it appears first in the database.
  if (collectorId) {
    const exact = candidates.find((candidate) => candidate.collector_id === collectorId);
    if (exact) return exact;
  }

  // Only treat a different collector as a reassignment when the row is
  // unambiguous. If multiple collector assignments exist, create a separate
  // assignment instead of stealing one from another collector.
  if (!allowCollectorChange || candidates.length !== 1) return undefined;
  return candidates[0];
}

export function reconcileDistributionPresence(input: {
  distributionRows: DistributionIdentityRow[];
  assignments: AssignmentRow[];
  matches: MatchRow[];
}): DistributionReconciliation {
  const presentKeys = currentDistributionKeys(input.distributionRows);
  const matchesById = new Map(
    input.matches.map((match) => [match.id, normalizeMatchId(match.external_id) ?? ""]),
  );
  const assignmentsByKey = new Map<DistributionLogicalKey, ReconciliationAssignment>();
  const presentAssignmentIds: string[] = [];
  const missingAssignmentIds: string[] = [];
  const restoredAssignmentIds: string[] = [];
  const unchangedPresentAssignmentIds: string[] = [];
  const unchangedMissingAssignmentIds: string[] = [];

  for (const assignment of input.assignments) {
    const matchExternalId = matchesById.get(assignment.match_id) ?? "";
    const key = assignmentLogicalKey(assignment, matchExternalId);
    if (!key) {
      missingAssignmentIds.push(assignment.id);
      if (!assignment.distribution_present) unchangedMissingAssignmentIds.push(assignment.id);
      continue;
    }
    assignmentsByKey.set(key, { assignment, matchExternalId, key });
    if (presentKeys.has(key)) {
      presentAssignmentIds.push(assignment.id);
      if (assignment.distribution_present) unchangedPresentAssignmentIds.push(assignment.id);
      else restoredAssignmentIds.push(assignment.id);
    } else {
      missingAssignmentIds.push(assignment.id);
      if (!assignment.distribution_present) unchangedMissingAssignmentIds.push(assignment.id);
    }
  }

  return {
    presentAssignmentIds,
    missingAssignmentIds,
    restoredAssignmentIds,
    unchangedPresentAssignmentIds,
    unchangedMissingAssignmentIds,
    presentKeys: [...presentKeys],
    assignmentsByKey,
  };
}

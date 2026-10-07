import type { AssignmentRow, AssignmentStatus, MatchRow, OverTargetRow } from "@/types/database.types";

export type AdminOverTargetRecord = OverTargetRow & {
  home_team: string | null;
  away_team: string | null;
  sla: string | null;
  assignment_status: AssignmentStatus | null;
  match_href: string | null;
};

export type AdminOverTargetAssignmentDetails = Pick<AssignmentRow, "id" | "match_id" | "collector_id" | "sla" | "status">;
export type AdminOverTargetMatchDetails = Pick<MatchRow, "id" | "external_id" | "home_team" | "away_team">;

export function adminOverTargetCollectorMatchKey(
  collectorId: string | null | undefined,
  matchId: string | null | undefined
): string | null {
  const collector = collectorId?.trim();
  const match = matchId?.trim();
  if (!collector || !match) return null;
  return `${collector}\t${match}`;
}

export function adminOverTargetAssignmentHref(assignmentId: string | null | undefined): string | null {
  if (!assignmentId) return null;
  const trimmed = assignmentId.trim();
  return trimmed ? `/admin/assignments/${encodeURIComponent(trimmed)}` : null;
}

export function uniqueAdminAssignmentByCollectorMatch(
  assignments: Iterable<AdminOverTargetAssignmentDetails>
): Map<string, AdminOverTargetAssignmentDetails> {
  const byAssignmentId = new Map<string, AdminOverTargetAssignmentDetails>();
  for (const assignment of assignments) {
    if (assignment.id) byAssignmentId.set(assignment.id, assignment);
  }
  const grouped = new Map<string, AdminOverTargetAssignmentDetails[]>();
  for (const assignment of byAssignmentId.values()) {
    const key = adminOverTargetCollectorMatchKey(assignment.collector_id, assignment.match_id);
    if (!key) continue;
    const list = grouped.get(key);
    if (list) list.push(assignment);
    else grouped.set(key, [assignment]);
  }
  const unique = new Map<string, AdminOverTargetAssignmentDetails>();
  for (const [key, list] of grouped) {
    if (list.length === 1 && list[0]) unique.set(key, list[0]);
  }
  return unique;
}

function resolveAdminMatch(
  row: OverTargetRow,
  assignment: AdminOverTargetAssignmentDetails | null,
  matchById: ReadonlyMap<string, AdminOverTargetMatchDetails>,
  matchByExternalId: ReadonlyMap<string, AdminOverTargetMatchDetails>
): AdminOverTargetMatchDetails | null {
  const matchId = assignment?.match_id ?? row.match_id;
  if (matchId) {
    const byId = matchById.get(matchId);
    if (byId) return byId;
  }
  const externalId = row.match_external_id?.trim();
  if (externalId) return matchByExternalId.get(externalId) ?? null;
  return null;
}

function resolveFallbackAdminAssignment(
  row: OverTargetRow,
  match: AdminOverTargetMatchDetails | null,
  assignmentByCollectorMatch: ReadonlyMap<string, AdminOverTargetAssignmentDetails>
): AdminOverTargetAssignmentDetails | null {
  const key = adminOverTargetCollectorMatchKey(row.collector_id, row.match_id ?? match?.id);
  if (!key) return null;
  return assignmentByCollectorMatch.get(key) ?? null;
}

function resolveAdminAssignmentHref(
  row: OverTargetRow,
  assignment: AdminOverTargetAssignmentDetails | null
): string | null {
  if (row.assignment_id?.trim()) return adminOverTargetAssignmentHref(row.assignment_id);
  return adminOverTargetAssignmentHref(assignment?.id);
}

export function mergeAdminOverTargetMatchDetails(
  row: OverTargetRow,
  assignmentById: ReadonlyMap<string, AdminOverTargetAssignmentDetails>,
  matchById: ReadonlyMap<string, AdminOverTargetMatchDetails>,
  matchByExternalId: ReadonlyMap<string, AdminOverTargetMatchDetails> = new Map(),
  assignmentByCollectorMatch: ReadonlyMap<string, AdminOverTargetAssignmentDetails> = new Map()
): AdminOverTargetRecord {
  const assignmentFromId = row.assignment_id ? assignmentById.get(row.assignment_id) ?? null : null;
  const match = resolveAdminMatch(row, assignmentFromId, matchById, matchByExternalId);
  const assignment = assignmentFromId ?? (row.assignment_id ? null : resolveFallbackAdminAssignment(row, match, assignmentByCollectorMatch));
  return {
    ...row,
    home_team: match?.home_team ?? null,
    away_team: match?.away_team ?? null,
    sla: assignment?.sla ?? null,
    assignment_status: assignment?.status ?? null,
    match_href: resolveAdminAssignmentHref(row, assignment),
  };
}

export function mergeAdminOverTargetRecords(
  records: OverTargetRow[],
  assignmentById: ReadonlyMap<string, AdminOverTargetAssignmentDetails>,
  matchById: ReadonlyMap<string, AdminOverTargetMatchDetails>,
  matchByExternalId: ReadonlyMap<string, AdminOverTargetMatchDetails> = new Map(),
  assignmentByCollectorMatch: ReadonlyMap<string, AdminOverTargetAssignmentDetails> = uniqueAdminAssignmentByCollectorMatch(
    assignmentById.values()
  )
): AdminOverTargetRecord[] {
  return records.map((row) =>
    mergeAdminOverTargetMatchDetails(row, assignmentById, matchById, matchByExternalId, assignmentByCollectorMatch)
  );
}

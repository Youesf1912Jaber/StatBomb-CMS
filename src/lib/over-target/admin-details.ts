import type { AssignmentRow, AssignmentStatus, MatchRow, OverTargetRow } from "@/types/database.types";

export type AdminOverTargetRecord = OverTargetRow & {
  home_team: string | null;
  away_team: string | null;
  sla: string | null;
  assignment_status: AssignmentStatus | null;
  match_href: string | null;
};

export type AdminOverTargetAssignmentDetails = Pick<AssignmentRow, "id" | "match_id" | "sla" | "status">;
export type AdminOverTargetMatchDetails = Pick<MatchRow, "id" | "external_id" | "home_team" | "away_team">;

export function adminOverTargetMatchHref(matchExternalId: string | null | undefined): string | null {
  if (!matchExternalId) return null;
  const trimmed = matchExternalId.trim();
  return trimmed ? `/admin/matches/${encodeURIComponent(trimmed)}/distribution` : null;
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

export function mergeAdminOverTargetMatchDetails(
  row: OverTargetRow,
  assignmentById: ReadonlyMap<string, AdminOverTargetAssignmentDetails>,
  matchById: ReadonlyMap<string, AdminOverTargetMatchDetails>,
  matchByExternalId: ReadonlyMap<string, AdminOverTargetMatchDetails> = new Map()
): AdminOverTargetRecord {
  const assignment = row.assignment_id ? assignmentById.get(row.assignment_id) ?? null : null;
  const match = resolveAdminMatch(row, assignment, matchById, matchByExternalId);
  const matchExternalId = match?.external_id || row.match_external_id;
  return {
    ...row,
    home_team: match?.home_team ?? null,
    away_team: match?.away_team ?? null,
    sla: assignment?.sla ?? null,
    assignment_status: assignment?.status ?? null,
    match_href: match ? adminOverTargetMatchHref(matchExternalId) : null,
  };
}

export function mergeAdminOverTargetRecords(
  records: OverTargetRow[],
  assignmentById: ReadonlyMap<string, AdminOverTargetAssignmentDetails>,
  matchById: ReadonlyMap<string, AdminOverTargetMatchDetails>,
  matchByExternalId: ReadonlyMap<string, AdminOverTargetMatchDetails> = new Map()
): AdminOverTargetRecord[] {
  return records.map((row) =>
    mergeAdminOverTargetMatchDetails(row, assignmentById, matchById, matchByExternalId)
  );
}

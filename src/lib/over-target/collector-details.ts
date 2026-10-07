import type { AssignmentRow, AssignmentStatus, MatchRow, OverTargetRow } from "@/types/database.types";

export type CollectorOverTargetRecord = OverTargetRow & {
  home_team: string | null;
  away_team: string | null;
  sla: string | null;
  assignment_status: AssignmentStatus | null;
  assignment_href: string | null;
};

export type CollectorOverTargetAssignmentDetails = Pick<AssignmentRow, "id" | "match_id" | "sla" | "status">;
export type CollectorOverTargetMatchDetails = Pick<MatchRow, "id" | "home_team" | "away_team">;

export function collectorOverTargetAssignmentHref(
  assignmentId: string | null | undefined
): string | null {
  if (!assignmentId) return null;
  const trimmed = assignmentId.trim();
  return trimmed ? `/collector/assignments/${trimmed}` : null;
}

export function mergeCollectorOverTargetMatchDetails(
  row: OverTargetRow,
  assignmentById: ReadonlyMap<string, CollectorOverTargetAssignmentDetails>,
  matchById: ReadonlyMap<string, CollectorOverTargetMatchDetails>
): CollectorOverTargetRecord {
  const assignment = row.assignment_id ? assignmentById.get(row.assignment_id) ?? null : null;
  const matchId = assignment?.match_id ?? row.match_id;
  const match = matchId ? matchById.get(matchId) ?? null : null;
  return {
    ...row,
    home_team: match?.home_team ?? null,
    away_team: match?.away_team ?? null,
    sla: assignment?.sla ?? null,
    assignment_status: assignment?.status ?? null,
    assignment_href: assignment ? collectorOverTargetAssignmentHref(assignment.id) : null,
  };
}

export function mergeCollectorOverTargetRecords(
  records: OverTargetRow[],
  assignmentById: ReadonlyMap<string, CollectorOverTargetAssignmentDetails>,
  matchById: ReadonlyMap<string, CollectorOverTargetMatchDetails>
): CollectorOverTargetRecord[] {
  return records.map((row) => mergeCollectorOverTargetMatchDetails(row, assignmentById, matchById));
}

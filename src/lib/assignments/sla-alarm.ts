import type { AssignmentWithMatch } from "./types";

export function toSlaWarningAlarmItems(
  assignments: AssignmentWithMatch[],
  collectorNameFor: (collectorId: string) => string
) {
  return assignments
    .filter((assignment) => assignment.status !== "Completed")
    .map((assignment) => ({
      assignmentId: assignment.id,
      sla: assignment.sla,
      status: assignment.status,
      homeTeam: assignment.match.home_team,
      awayTeam: assignment.match.away_team,
      competition: assignment.match.competition,
      collectorName: collectorNameFor(assignment.collector_id),
      half: assignment.half,
      task: assignment.task,
    }));
}

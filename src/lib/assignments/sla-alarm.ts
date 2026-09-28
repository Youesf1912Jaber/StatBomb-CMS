import type { AssignmentWithMatch } from "./types";
import type { AssignmentStatus } from "@/types/database.types";

export interface SlaAlertAssignment {
  assignmentId: string;
  sla: string;
  status: AssignmentStatus;
  homeTeam: string;
  awayTeam: string;
  competition: string | null;
  collectorName: string;
  half: string;
  task: string;
}

export const SLA_WARNING_LEAD_MS = 60 * 60 * 1000;

export function toSlaAlertItems(
  assignments: AssignmentWithMatch[],
  collectorNameFor: (collectorId: string) => string
): SlaAlertAssignment[] {
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

export function warningEventId(assignment: Pick<SlaAlertAssignment, "assignmentId" | "sla">): string {
  return `${assignment.assignmentId}:${assignment.sla}`;
}

export function isSlaWarningActive(
  assignment: Pick<SlaAlertAssignment, "sla" | "status">,
  now = Date.now()
): boolean {
  if (assignment.status === "Completed") return false;

  const deadline = new Date(assignment.sla).getTime();
  if (!Number.isFinite(deadline)) return false;

  return now >= deadline - SLA_WARNING_LEAD_MS && now < deadline;
}

export function nextSlaAlertCheck(
  assignments: SlaAlertAssignment[],
  now = Date.now()
): number | null {
  let next: number | null = null;

  for (const assignment of assignments) {
    if (assignment.status === "Completed") continue;

    const deadline = new Date(assignment.sla).getTime();
    if (!Number.isFinite(deadline)) continue;

    const warningAt = deadline - SLA_WARNING_LEAD_MS;
    const candidate = now < warningAt ? warningAt : now < deadline ? deadline : null;
    if (candidate !== null && (next === null || candidate < next)) {
      next = candidate;
    }
  }

  return next;
}

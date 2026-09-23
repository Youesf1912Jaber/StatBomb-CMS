import type { AssignmentStatus } from "@/types/database.types";

export const DISTRIBUTION_PRESENT_LABEL = "Current Distribution";
export const DISTRIBUTION_MISSING_LABEL = "Distribution Missing/Removed";

export function distributionPresenceLabel(present: boolean): string {
  return present ? DISTRIBUTION_PRESENT_LABEL : DISTRIBUTION_MISSING_LABEL;
}

export function isCurrentDistributionAssignment(assignment: {
  distribution_present: boolean;
}): boolean {
  return assignment.distribution_present;
}

export function isCurrentActiveDistributionAssignment(assignment: {
  distribution_present: boolean;
}): boolean {
  return assignment.distribution_present;
}

export function isOperationalAssignment(assignment: {
  distribution_present: boolean;
  status: AssignmentStatus;
}): boolean {
  if (assignment.distribution_present) return true;
  return assignment.status !== "Not Started";
}

import { parseCalendarDate } from "../dates";

/**
 * External Match ID from Matches(T) / Google Sheets, never the database UUID.
 */
export function displayAssignmentMatchId(assignment: {
  match?: { external_id?: string | null } | null;
}): string {
  const externalId = assignment.match?.external_id?.trim() ?? "";
  return externalId || "—";
}

/**
 * Distribution Shift Date, never Match Date.
 * Parses with MDY-aware calendar utilities so slash dates stay on the same day.
 */
export function displayAssignmentShiftDate(assignment: {
  shift_date?: string | null;
}): string {
  return parseCalendarDate(assignment.shift_date, "mdy") ?? "—";
}

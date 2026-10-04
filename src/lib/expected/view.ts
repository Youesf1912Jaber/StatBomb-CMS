export type ExpectedWeekViewCell = {
  value: string;
  row: number;
  column: number;
  column_letter: string;
};

export type ExpectedWeekViewCollector = {
  row_number: number;
  hr_code: string;
  collector: string;
  type: string;
  sunday: string;
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  count_m1: string;
  sum_m1: string;
  actual_m1: string;
};

export type ExpectedWeekViewSummaryKey =
  | "al_r"
  | "ul"
  | "al_c"
  | "h"
  | "sl"
  | "total_absence"
  | "total_shifts_all_team"
  | "expected_shift_matches"
  | "over_target"
  | "total_shift_expected_before"
  | "expected_matches_before_week"
  | "completed_end_of_week"
  | "actual_shifts_end_of_week"
  | "diff";

export type ExpectedWeekView = {
  week_id: string;
  start_date: string | null;
  end_date: string | null;
  shift: string | null;
  shift_time: string | null;
  header_row: number;
  start_row: number;
  end_row: number;
  collectors: ExpectedWeekViewCollector[];
  summary: Record<ExpectedWeekViewSummaryKey, ExpectedWeekViewCell | null> & {
    extras: Array<{
      key: string;
      label: ExpectedWeekViewCell;
      value: ExpectedWeekViewCell;
    }>;
  };
};

export const EXPECTED_SUMMARY_LABELS: Array<[ExpectedWeekViewSummaryKey, string]> = [
  ["al_r", "AL-R"],
  ["ul", "UL"],
  ["al_c", "AL-C"],
  ["h", "H"],
  ["sl", "SL"],
  ["total_absence", "Total absence"],
  ["total_shifts_all_team", "Total shifts / all team"],
  ["expected_shift_matches", "expected shift / matches"],
  ["over_target", "over target"],
  ["total_shift_expected_before", "Total Shift expected / before"],
  ["expected_matches_before_week", "Expected Matches / before week"],
  ["completed_end_of_week", "Completed / end of the week"],
  ["actual_shifts_end_of_week", "actual shifts / end of the week"],
  ["diff", "diff"],
];

export function displayExpectedValue(value: string | null | undefined): string {
  return value && value.trim() ? value : "—";
}

export function displayExpectedDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

export function displayExpectedShift(week: Pick<ExpectedWeekView, "shift" | "shift_time">): string {
  const shift = displayExpectedValue(week.shift);
  if (shift === "—") return displayExpectedValue(week.shift_time);
  if (week.shift_time?.trim()) return `${shift} · ${week.shift_time.trim()}`;
  return shift;
}

export function sortExpectedWeeksNewestFirst(weeks: ExpectedWeekView[]): ExpectedWeekView[] {
  return [...weeks].sort((a, b) => {
    if (a.start_date && b.start_date) {
      if (a.start_date < b.start_date) return 1;
      if (a.start_date > b.start_date) return -1;
      return a.header_row - b.header_row;
    }
    if (a.start_date) return -1;
    if (b.start_date) return 1;
    return a.header_row - b.header_row;
  });
}

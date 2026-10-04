export type ExpectedWeekday =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

export type ExpectedSummaryKey =
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

export type ExpectedSheetCell = {
  row: number;
  column: number;
  column_letter: string;
  value: string;
};

export type ExpectedColumnMap = {
  hr_code: number;
  collector: number;
  type: number;
  days: Record<ExpectedWeekday, number>;
  count_m1: number;
  sum_m1: number;
  actual_m1: number;
  summary_start: number;
};

export type ExpectedCollectorRow = {
  row_number: number;
  hr_code: ExpectedSheetCell;
  collector: ExpectedSheetCell;
  type: ExpectedSheetCell;
  days: Record<ExpectedWeekday, ExpectedSheetCell>;
  count_m1: ExpectedSheetCell;
  sum_m1: ExpectedSheetCell;
  actual_m1: ExpectedSheetCell;
};

export type ExpectedSummaryEntry = {
  key: string;
  label: ExpectedSheetCell;
  value: ExpectedSheetCell;
};

export type ExpectedWeekSummary = Record<ExpectedSummaryKey, ExpectedSheetCell | null> & {
  extras: ExpectedSummaryEntry[];
};

export type ExpectedWeekBlock = {
  header_row: number;
  start_row: number;
  end_row: number;
  week_start_date: string | null;
  week_end_date: string | null;
  week_start_cell: ExpectedSheetCell | null;
  week_end_cell: ExpectedSheetCell | null;
  shift_name: string | null;
  shift_name_cell: ExpectedSheetCell | null;
  shift_time: string | null;
  shift_time_cell: ExpectedSheetCell | null;
  columns: ExpectedColumnMap;
  collectors: ExpectedCollectorRow[];
  summary: ExpectedWeekSummary;
};

export type ExpectedSheetData = {
  spreadsheet_id: string;
  sheet_name: string;
  sheet_id: number;
  pulled_at: string;
  weeks: ExpectedWeekBlock[];
};

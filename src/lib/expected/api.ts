import "server-only";

import { NextResponse } from "next/server";
import { PreviewInputError } from "@/lib/sync/preview";
import { createClient } from "@/lib/supabase/server";
import { readExpectedSheet } from "./sheet";
import type {
  ExpectedCollectorRow,
  ExpectedSheetCell,
  ExpectedSheetData,
  ExpectedSummaryEntry,
  ExpectedSummaryKey,
  ExpectedWeekBlock,
  ExpectedWeekSummary,
} from "./types";

export type ExpectedApiCell = {
  value: string;
  row: number;
  column: number;
  column_letter: string;
};

export type ExpectedApiCollector = {
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
  cells: {
    hr_code: ExpectedApiCell;
    collector: ExpectedApiCell;
    type: ExpectedApiCell;
    sunday: ExpectedApiCell;
    monday: ExpectedApiCell;
    tuesday: ExpectedApiCell;
    wednesday: ExpectedApiCell;
    thursday: ExpectedApiCell;
    friday: ExpectedApiCell;
    saturday: ExpectedApiCell;
    count_m1: ExpectedApiCell;
    sum_m1: ExpectedApiCell;
    actual_m1: ExpectedApiCell;
  };
};

export type ExpectedApiSummaryValue = ExpectedApiCell | null;

export type ExpectedApiWeek = {
  week_id: string;
  start_date: string | null;
  end_date: string | null;
  shift: string | null;
  shift_time: string | null;
  header_row: number;
  start_row: number;
  end_row: number;
  collectors: ExpectedApiCollector[];
  summary: Record<ExpectedSummaryKey, ExpectedApiSummaryValue> & {
    extras: Array<{
      key: string;
      label: ExpectedApiCell;
      value: ExpectedApiCell;
    }>;
  };
  cells: {
    week_start: ExpectedApiCell | null;
    week_end: ExpectedApiCell | null;
    shift_name: ExpectedApiCell | null;
    shift_time: ExpectedApiCell | null;
  };
};

const SUMMARY_KEYS: ExpectedSummaryKey[] = [
  "al_r",
  "ul",
  "al_c",
  "h",
  "sl",
  "total_absence",
  "total_shifts_all_team",
  "expected_shift_matches",
  "over_target",
  "total_shift_expected_before",
  "expected_matches_before_week",
  "completed_end_of_week",
  "actual_shifts_end_of_week",
  "diff",
];

function apiCell(cell: ExpectedSheetCell): ExpectedApiCell {
  return {
    value: cell.value,
    row: cell.row,
    column: cell.column,
    column_letter: cell.column_letter,
  };
}

function apiCellOrNull(cell: ExpectedSheetCell | null): ExpectedApiCell | null {
  return cell ? apiCell(cell) : null;
}

export function expectedWeekId(week: ExpectedWeekBlock): string {
  const start = week.week_start_date ?? "undated";
  return `${start}-r${week.header_row}`;
}

function serializeCollector(row: ExpectedCollectorRow): ExpectedApiCollector {
  return {
    row_number: row.row_number,
    hr_code: row.hr_code.value,
    collector: row.collector.value,
    type: row.type.value,
    sunday: row.days.sunday.value,
    monday: row.days.monday.value,
    tuesday: row.days.tuesday.value,
    wednesday: row.days.wednesday.value,
    thursday: row.days.thursday.value,
    friday: row.days.friday.value,
    saturday: row.days.saturday.value,
    count_m1: row.count_m1.value,
    sum_m1: row.sum_m1.value,
    actual_m1: row.actual_m1.value,
    cells: {
      hr_code: apiCell(row.hr_code),
      collector: apiCell(row.collector),
      type: apiCell(row.type),
      sunday: apiCell(row.days.sunday),
      monday: apiCell(row.days.monday),
      tuesday: apiCell(row.days.tuesday),
      wednesday: apiCell(row.days.wednesday),
      thursday: apiCell(row.days.thursday),
      friday: apiCell(row.days.friday),
      saturday: apiCell(row.days.saturday),
      count_m1: apiCell(row.count_m1),
      sum_m1: apiCell(row.sum_m1),
      actual_m1: apiCell(row.actual_m1),
    },
  };
}

function serializeSummary(summary: ExpectedWeekSummary): ExpectedApiWeek["summary"] {
  const mapped = {} as Record<ExpectedSummaryKey, ExpectedApiSummaryValue>;
  for (const key of SUMMARY_KEYS) {
    mapped[key] = apiCellOrNull(summary[key]);
  }
  return {
    ...mapped,
    extras: summary.extras.map((entry: ExpectedSummaryEntry) => ({
      key: entry.key,
      label: apiCell(entry.label),
      value: apiCell(entry.value),
    })),
  };
}

export function serializeExpectedWeek(week: ExpectedWeekBlock): ExpectedApiWeek {
  return {
    week_id: expectedWeekId(week),
    start_date: week.week_start_date,
    end_date: week.week_end_date,
    shift: week.shift_name,
    shift_time: week.shift_time,
    header_row: week.header_row,
    start_row: week.start_row,
    end_row: week.end_row,
    collectors: week.collectors.map(serializeCollector),
    summary: serializeSummary(week.summary),
    cells: {
      week_start: apiCellOrNull(week.week_start_cell),
      week_end: apiCellOrNull(week.week_end_cell),
      shift_name: apiCellOrNull(week.shift_name_cell),
      shift_time: apiCellOrNull(week.shift_time_cell),
    },
  };
}

export async function requireExpectedAdmin(): Promise<
  { ok: true } | { ok: false; response: NextResponse }
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Authentication required." }, { status: 401 }),
    };
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Admin access required." }, { status: 403 }),
    };
  }
  return { ok: true };
}

export async function loadExpectedWeeks(): Promise<ExpectedSheetData> {
  const data = await readExpectedSheet();
  return {
    ...data,
    weeks: [...data.weeks].sort((a, b) => {
      if (a.week_start_date && b.week_start_date) {
        if (a.week_start_date < b.week_start_date) return 1;
        if (a.week_start_date > b.week_start_date) return -1;
        return a.header_row - b.header_row;
      }
      if (a.week_start_date) return -1;
      if (b.week_start_date) return 1;
      return a.header_row - b.header_row;
    }),
  };
}

export function expectedErrorResponse(error: unknown, fallback: string): NextResponse {
  console.error(fallback, error);
  const message = error instanceof PreviewInputError ? error.safeMessage : fallback;
  const status = error instanceof PreviewInputError ? 422 : 500;
  return NextResponse.json({ error: message }, { status });
}

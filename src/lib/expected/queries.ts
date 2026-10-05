import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ExpectedWeekRow } from "@/types/database.types";

type Client = SupabaseClient<Database>;

const PAGE_SIZE = 1000;

export type ExpectedCachedWeekListItem = {
  week_id: string;
  start_date: string;
  end_date: string;
  shift: string | null;
  shift_time: string | null;
  header_row: number;
  start_row: number;
  end_row: number;
  collector_count: number;
};

function formatShiftTime(start: string | null, end: string | null): string | null {
  if (start && end) return `${start} – ${end}`;
  return start ?? end ?? null;
}

async function fetchPresentWeeks(client: Client): Promise<ExpectedWeekRow[]> {
  const rows: ExpectedWeekRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from("expected_weeks")
      .select("*")
      .eq("source_present", true)
      .order("week_start_date", { ascending: false })
      .order("sheet_header_row", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchCollectorCounts(client: Client, weekIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (weekIds.length === 0) return counts;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from("expected_week_collectors")
      .select("week_id")
      .in("week_id", weekIds)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    for (const row of page) {
      counts.set(row.week_id, (counts.get(row.week_id) ?? 0) + 1);
    }
    if (page.length < PAGE_SIZE) break;
  }
  return counts;
}

export async function listCachedExpectedWeeks(client: Client): Promise<ExpectedCachedWeekListItem[]> {
  const weeks = await fetchPresentWeeks(client);
  const counts = await fetchCollectorCounts(
    client,
    weeks.map((week) => week.id)
  );
  return weeks.map((week) => ({
    week_id: week.week_key,
    start_date: week.week_start_date,
    end_date: week.week_end_date,
    shift: week.shift_name,
    shift_time: formatShiftTime(week.shift_start_time, week.shift_end_time),
    header_row: week.sheet_header_row,
    start_row: week.sheet_start_row,
    end_row: week.sheet_end_row,
    collector_count: counts.get(week.id) ?? 0,
  }));
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  ExpectedWeekCollectorRow,
  ExpectedWeekRow,
} from "@/types/database.types";
import { reconcileAnnualLeaveLedger } from "@/lib/annual-spare/ledger-sync";
import { expectedWeekId } from "./api";
import { readExpectedSheet } from "./sheet";
import type {
  ExpectedCollectorRow,
  ExpectedSheetCell,
  ExpectedSummaryKey,
  ExpectedWeekBlock,
  ExpectedWeekSummary,
} from "./types";

type Client = SupabaseClient<Database>;

const PAGE_SIZE = 1000;
const WRITE_CHUNK_SIZE = 100;

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

export type ExpectedSyncResult = {
  inserted: number;
  updated: number;
  unchanged: number;
  missing: number;
  collectorRows: number;
};

function nullableText(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return text === "" ? null : text;
}

function splitShiftTime(raw: string | null): { start: string | null; end: string | null } {
  const text = nullableText(raw);
  if (!text) return { start: null, end: null };
  const parts = text.split(/\s*(?:[-–—]|to)\s*/i).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return { start: parts[0] ?? null, end: parts[1] ?? null };
  return { start: text, end: null };
}

function cellValue(cell: ExpectedSheetCell | null | undefined): string | null {
  return nullableText(cell?.value);
}

function serializeSummary(summary: ExpectedWeekSummary): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const key of SUMMARY_KEYS) {
    payload[key] = cellValue(summary[key]);
  }
  payload.extras = summary.extras.map((entry) => ({
    key: entry.key,
    label: entry.label.value,
    value: entry.value.value,
  }));
  return payload;
}

function summariesEqual(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

type WeekPayload = {
  week_key: string;
  week_start_date: string;
  week_end_date: string;
  shift_name: string | null;
  shift_start_time: string | null;
  shift_end_time: string | null;
  sheet_header_row: number;
  sheet_start_row: number;
  sheet_end_row: number;
  summary: Record<string, unknown>;
};

function toWeekPayload(week: ExpectedWeekBlock): WeekPayload | null {
  if (!week.week_start_date || !week.week_end_date) return null;
  const times = splitShiftTime(week.shift_time);
  return {
    week_key: expectedWeekId(week),
    week_start_date: week.week_start_date,
    week_end_date: week.week_end_date,
    shift_name: nullableText(week.shift_name),
    shift_start_time: times.start,
    shift_end_time: times.end,
    sheet_header_row: week.header_row,
    sheet_start_row: week.start_row,
    sheet_end_row: week.end_row,
    summary: serializeSummary(week.summary),
  };
}

function weekUnchanged(existing: ExpectedWeekRow, payload: WeekPayload): boolean {
  return (
    existing.week_start_date === payload.week_start_date &&
    existing.week_end_date === payload.week_end_date &&
    existing.shift_name === payload.shift_name &&
    existing.shift_start_time === payload.shift_start_time &&
    existing.shift_end_time === payload.shift_end_time &&
    existing.sheet_header_row === payload.sheet_header_row &&
    existing.sheet_start_row === payload.sheet_start_row &&
    existing.sheet_end_row === payload.sheet_end_row &&
    existing.source_present === true &&
    summariesEqual(existing.summary ?? {}, payload.summary)
  );
}

type CollectorPayload = {
  week_id: string;
  hr_code: string;
  collector_name: string | null;
  collector_type: string | null;
  sunday: string | null;
  monday: string | null;
  tuesday: string | null;
  wednesday: string | null;
  thursday: string | null;
  friday: string | null;
  saturday: string | null;
  sheet_row_number: number;
};

function toCollectorPayload(weekId: string, row: ExpectedCollectorRow): CollectorPayload | null {
  const hrCode = nullableText(row.hr_code.value);
  if (!hrCode) return null;
  return {
    week_id: weekId,
    hr_code: hrCode,
    collector_name: nullableText(row.collector.value),
    collector_type: nullableText(row.type.value),
    sunday: nullableText(row.days.sunday.value),
    monday: nullableText(row.days.monday.value),
    tuesday: nullableText(row.days.tuesday.value),
    wednesday: nullableText(row.days.wednesday.value),
    thursday: nullableText(row.days.thursday.value),
    friday: nullableText(row.days.friday.value),
    saturday: nullableText(row.days.saturday.value),
    sheet_row_number: row.row_number,
  };
}

function collectorUnchanged(existing: ExpectedWeekCollectorRow, payload: CollectorPayload): boolean {
  return (
    existing.hr_code === payload.hr_code &&
    existing.collector_name === payload.collector_name &&
    existing.collector_type === payload.collector_type &&
    existing.sunday === payload.sunday &&
    existing.monday === payload.monday &&
    existing.tuesday === payload.tuesday &&
    existing.wednesday === payload.wednesday &&
    existing.thursday === payload.thursday &&
    existing.friday === payload.friday &&
    existing.saturday === payload.saturday &&
    existing.sheet_row_number === payload.sheet_row_number
  );
}

async function fetchAllWeeks(client: Client): Promise<ExpectedWeekRow[]> {
  const rows: ExpectedWeekRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from("expected_weeks")
      .select("*")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchAllCollectors(client: Client): Promise<ExpectedWeekCollectorRow[]> {
  const rows: ExpectedWeekCollectorRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from("expected_week_collectors")
      .select("*")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function insertWeek(client: Client, payload: WeekPayload, now: string): Promise<string> {
  const { data, error } = await client
    .from("expected_weeks")
    .insert({
      ...payload,
      source_present: true,
      last_seen_at: now,
      first_synced_at: now,
      last_synced_at: now,
    })
    .select("id")
    .single();
  if (error) throw error;
  if (!data?.id) throw new Error("Expected week insert did not return an id.");
  return data.id;
}

async function updateWeek(client: Client, id: string, payload: WeekPayload, now: string): Promise<void> {
  const { error } = await client
    .from("expected_weeks")
    .update({
      ...payload,
      source_present: true,
      last_seen_at: now,
      last_synced_at: now,
    })
    .eq("id", id);
  if (error) throw error;
}

async function touchWeeks(client: Client, ids: string[], now: string): Promise<void> {
  for (let i = 0; i < ids.length; i += WRITE_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + WRITE_CHUNK_SIZE);
    const { error } = await client
      .from("expected_weeks")
      .update({
        source_present: true,
        last_seen_at: now,
        last_synced_at: now,
      })
      .in("id", chunk);
    if (error) throw error;
  }
}

async function markMissingWeeks(client: Client, ids: string[], now: string): Promise<void> {
  for (let i = 0; i < ids.length; i += WRITE_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + WRITE_CHUNK_SIZE);
    const { error } = await client
      .from("expected_weeks")
      .update({
        source_present: false,
        last_synced_at: now,
      })
      .in("id", chunk);
    if (error) throw error;
  }
}

async function upsertCollectors(client: Client, rows: CollectorPayload[]): Promise<void> {
  for (let i = 0; i < rows.length; i += WRITE_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + WRITE_CHUNK_SIZE);
    const { error } = await client
      .from("expected_week_collectors")
      .upsert(chunk, { onConflict: "week_id,hr_code" });
    if (error) throw error;
  }
}

async function deleteCollectors(client: Client, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += WRITE_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + WRITE_CHUNK_SIZE);
    const { error } = await client.from("expected_week_collectors").delete().in("id", chunk);
    if (error) throw error;
  }
}

function collectorsForWeek(weekId: string, rows: ExpectedCollectorRow[]): CollectorPayload[] {
  const byHr = new Map<string, CollectorPayload>();
  for (const row of rows) {
    const payload = toCollectorPayload(weekId, row);
    if (!payload) continue;
    byHr.set(payload.hr_code, payload);
  }
  return [...byHr.values()];
}

async function syncWeekCollectors(
  client: Client,
  weekId: string,
  sheetRows: ExpectedCollectorRow[],
  existingRows: ExpectedWeekCollectorRow[]
): Promise<number> {
  const current = collectorsForWeek(weekId, sheetRows);
  const existingByHr = new Map(existingRows.map((row) => [row.hr_code, row]));
  const keep = new Set(current.map((row) => row.hr_code));
  const toUpsert = current.filter((row) => {
    const existing = existingByHr.get(row.hr_code);
    return !existing || !collectorUnchanged(existing, row);
  });
  const staleIds = existingRows.filter((row) => !keep.has(row.hr_code)).map((row) => row.id);

  if (toUpsert.length > 0) await upsertCollectors(client, toUpsert);
  if (staleIds.length > 0) await deleteCollectors(client, staleIds);
  return current.length;
}

export async function syncExpectedWeeks(client: Client): Promise<ExpectedSyncResult> {
  // ===== ENVIRONMENT VALIDATION =====
  console.log("[EXPECTED_SYNC] START - Checking environment");
  const hasSpreadsheetId = !!process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  const hasTabName = !!process.env.GOOGLE_SHEETS_EXPECTED_TAB?.trim();
  const hasGid = !!process.env.GOOGLE_SHEETS_EXPECTED_GID?.trim();
  console.log(
    `[EXPECTED_SYNC] ENV: spreadsheet=${hasSpreadsheetId}, tab=${hasTabName}, gid=${hasGid}`
  );

  // ===== READ SHEET =====
  let sheetInfo = { title: "", sheetId: -1 };
  let matrixRowCount = 0;
  try {
    console.log("[EXPECTED_SYNC] Calling readExpectedSheet()");
    const sheet = await readExpectedSheet();
    sheetInfo = { title: sheet.sheet_name, sheetId: sheet.sheet_id };
    matrixRowCount = sheet.weeks.length > 0 ? sheet.weeks[0]?.end_row ?? 0 : 0;
    console.log(
      `[EXPECTED_SYNC] Sheet resolved: title="${sheet.sheet_name}", gid=${sheet.sheet_id}`
    );
    console.log(`[EXPECTED_SYNC] Parser input row count: ${matrixRowCount}`);
    console.log(`[EXPECTED_SYNC] Parser output: ${sheet.weeks.length} weeks detected`);

    if (sheet.weeks.length > 0) {
      const samples = sheet.weeks.slice(0, 3);
      for (let i = 0; i < samples.length; i++) {
        const w = samples[i];
        console.log(
          `[EXPECTED_SYNC] Week ${i + 1}: ${w?.week_start_date ?? "?"} → ${w?.week_end_date ?? "?"}, shift="${w?.shift_name ?? "?"}", collectors=${w?.collectors.length ?? 0}`
        );
      }
    }

    // ===== FETCH EXISTING DATA =====
    console.log("[EXPECTED_SYNC] Fetching existing weeks from Supabase");
    const [existingWeeks, existingCollectors] = await Promise.all([
      fetchAllWeeks(client),
      fetchAllCollectors(client),
    ]);
    console.log(
      `[EXPECTED_SYNC] Supabase state: ${existingWeeks.length} existing weeks, ${existingCollectors.length} existing collectors`
    );

    // ===== SYNC LOGIC =====
    const now = new Date().toISOString();
    const existingByKey = new Map(existingWeeks.map((row) => [row.week_key, row]));
    const collectorsByWeekId = new Map<string, ExpectedWeekCollectorRow[]>();
    for (const row of existingCollectors) {
      const list = collectorsByWeekId.get(row.week_id) ?? [];
      list.push(row);
      collectorsByWeekId.set(row.week_id, list);
    }

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    let collectorRows = 0;
    const seenKeys = new Set<string>();
    const unchangedIds: string[] = [];

    for (const week of sheet.weeks) {
      const payload = toWeekPayload(week);
      if (!payload) continue;
      seenKeys.add(payload.week_key);
      const existing = existingByKey.get(payload.week_key);
      let weekId: string;
      if (existing) {
        weekId = existing.id;
        if (weekUnchanged(existing, payload)) {
          unchangedIds.push(existing.id);
          unchanged += 1;
        } else {
          await updateWeek(client, existing.id, payload, now);
          updated += 1;
        }
      } else {
        weekId = await insertWeek(client, payload, now);
        inserted += 1;
      }
      collectorRows += await syncWeekCollectors(
        client,
        weekId,
        week.collectors,
        collectorsByWeekId.get(weekId) ?? []
      );
    }

    console.log(
      `[EXPECTED_SYNC] Upsert summary: inserted=${inserted}, updated=${updated}, unchanged=${unchanged}, collectors=${collectorRows}`
    );

    if (unchangedIds.length > 0) await touchWeeks(client, unchangedIds, now);

    const missingIds = existingWeeks
      .filter((row) => row.source_present && !seenKeys.has(row.week_key))
      .map((row) => row.id);
    if (missingIds.length > 0) {
      await markMissingWeeks(client, missingIds, now);
      console.log(`[EXPECTED_SYNC] Marked ${missingIds.length} weeks as missing`);
    }

    console.log("[EXPECTED_SYNC] Reconciling annual leave ledger");
    const ledger = await reconcileAnnualLeaveLedger(client, sheet.weeks);
    console.log(
      `[EXPECTED_SYNC] Ledger: inserted=${ledger.inserted}, consumed=${ledger.consumed}, reversed=${ledger.reversed}`
    );

    // ===== VERIFY FINAL STATE =====
    console.log("[EXPECTED_SYNC] Verifying final Supabase state");
    const { data: finalPresent, error: queryError } = await client
      .from("expected_weeks")
      .select("id, week_start_date")
      .eq("source_present", true)
      .limit(5);

    if (queryError) {
      console.log(
        `[EXPECTED_SYNC] ERROR querying final state: code=${queryError.code}, msg=${queryError.message}`
      );
    } else {
      console.log(`[EXPECTED_SYNC] Final source_present=true count: ${finalPresent?.length ?? 0}`);
      if ((finalPresent?.length ?? 0) > 0) {
        console.log(
          `[EXPECTED_SYNC] Sample rows: ${finalPresent?.map((r) => r.week_start_date).join(", ")}`
        );
      }
    }

    console.log("[EXPECTED_SYNC] COMPLETE");
    return {
      inserted,
      updated,
      unchanged,
      missing: missingIds.length,
      collectorRows,
    };
  } catch (error) {
    console.log("[EXPECTED_SYNC] EXCEPTION:", error instanceof Error ? error.message : String(error));
    console.log("[EXPECTED_SYNC] Sheet that was being resolved:", sheetInfo.title, `(gid=${sheetInfo.sheetId})`);
    throw error;
  }
}

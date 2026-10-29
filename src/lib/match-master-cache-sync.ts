import "server-only";

import { createHash } from "crypto";

import { normalizeEtaDate } from "@/lib/match-master-date";
import { readMatchesMasterSheet, type MatchMasterRow } from "@/lib/sync/google-sheets";
import { createServiceRoleClient } from "@/lib/supabase/server";

export function parseMatchMasterSla(value: string | null): string | null {
  if (!value?.trim()) return null;
  const raw = value.trim();
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
  if (us) {
    const month = Number(us[1]), day = Number(us[2]), year = Number(us[3]);
    let hour = Number(us[4] ?? 0);
    const minute = Number(us[5] ?? 0), second = Number(us[6] ?? 0);
    const meridiem = us[7]?.toUpperCase();
    if (meridiem === "PM" && hour < 12) hour += 12;
    if (meridiem === "AM" && hour === 12) hour = 0;

    // Google Sheets SLA values without an explicit timezone are Cairo wall-clock
    // times. Validate the civil date first, then attach Cairo's UTC+03:00 offset
    // before converting to the UTC instant stored in the cache.
    const civil = new Date(Date.UTC(year, month - 1, day));
    if (
      civil.getUTCFullYear() !== year ||
      civil.getUTCMonth() !== month - 1 ||
      civil.getUTCDate() !== day ||
      hour < 0 || hour > 23 ||
      minute < 0 || minute > 59 ||
      second < 0 || second > 59
    ) return null;

    const cairoLocal = String(year).padStart(4, "0") + "-" +
      String(month).padStart(2, "0") + "-" +
      String(day).padStart(2, "0") + "T" +
      String(hour).padStart(2, "0") + ":" +
      String(minute).padStart(2, "0") + ":" +
      String(second).padStart(2, "0") + "+03:00";
    const date = new Date(cairoLocal);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  // Values with an explicit ISO timezone already identify an absolute instant.
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function toCacheRow(row: MatchMasterRow, syncedAt: string) {
  return {
    match_id: row.match_id,
    eta_date: normalizeEtaDate(row.eta),
    sla_sort_at: parseMatchMasterSla(row.sla),
    home_team: row.home_team,
    away_team: row.away_team,
    match_data: row,
    source_fingerprint: createHash("sha256").update(stableStringify(row)).digest("hex"),
    synced_at: syncedAt,
  };
}

function fingerprintEtaDay(rows: ReturnType<typeof toCacheRow>[]): string {
  // Match ID ordering makes the fingerprint independent of Google Sheets row order.
  const canonicalRows = [...rows]
    .sort((a, b) => a.match_id.localeCompare(b.match_id))
    .map((row) => ({
      match_id: row.match_id,
      eta_date: row.eta_date,
      sla_sort_at: row.sla_sort_at,
      home_team: row.home_team,
      away_team: row.away_team,
      match_data: row.match_data,
    }));
  return createHash("sha256").update(stableStringify(canonicalRows)).digest("hex");
}

/** Refresh the materialized Match Master cache without exposing service-role credentials. */
export async function syncMatchMasterCache() {
  const sourceRows = await readMatchesMasterSheet();
  if (sourceRows.length === 0) {
    throw new Error("Match Master sync returned zero rows; refusing to replace the cache.");
  }

  const syncedAt = new Date().toISOString();
  // The source sheet can repeat a Match ID across rows. The cache intentionally
  // has one row per match, so retain the row with the earliest valid SLA.
  const rowByMatchId = new Map<string, ReturnType<typeof toCacheRow>>();
  for (const source of sourceRows) {
    const candidate = toCacheRow(source, syncedAt);
    const current = rowByMatchId.get(candidate.match_id);
    if (!current) {
      rowByMatchId.set(candidate.match_id, candidate);
      continue;
    }
    const candidateSla = candidate.sla_sort_at ? Date.parse(candidate.sla_sort_at) : Number.POSITIVE_INFINITY;
    const currentSla = current.sla_sort_at ? Date.parse(current.sla_sort_at) : Number.POSITIVE_INFINITY;
    if (candidateSla < currentSla || (candidateSla === currentSla && !current.eta_date && Boolean(candidate.eta_date))) {
      rowByMatchId.set(candidate.match_id, candidate);
    }
  }
  const cacheRows = [...rowByMatchId.values()];
  const supabase = createServiceRoleClient();

  // Read compact cache metadata only; never download every match_data JSON payload.
  const existingCache = new Map<string, { source_fingerprint: string | null; sla_sort_at: string | null; eta_date: string | null }>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("match_master_cache")
      .select("match_id, source_fingerprint, sla_sort_at, eta_date")
      .order("match_id", { ascending: true })
      .range(offset, offset + 999);
    if (error) throw error;
    for (const row of data ?? []) {
      existingCache.set(row.match_id, {
        source_fingerprint: row.source_fingerprint,
        sla_sort_at: row.sla_sort_at,
        eta_date: row.eta_date,
      });
    }
    if (!data || data.length < 1000) break;
  }

  const rowsByEtaDate = new Map<string, ReturnType<typeof toCacheRow>[]>();
  for (const row of cacheRows) {
    if (!row.eta_date) continue;
    const dayRows = rowsByEtaDate.get(row.eta_date) ?? [];
    dayRows.push(row);
    rowsByEtaDate.set(row.eta_date, dayRows);
  }

  const existingDayFingerprints = new Map<string, { source_fingerprint: string; match_count: number }>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("match_master_eta_fingerprints")
      .select("eta_date, source_fingerprint, match_count")
      .order("eta_date", { ascending: true })
      .range(offset, offset + 999);
    if (error) throw error;
    for (const row of data ?? []) {
      existingDayFingerprints.set(row.eta_date, {
        source_fingerprint: row.source_fingerprint,
        match_count: row.match_count,
      });
    }
    if (!data || data.length < 1000) break;
  }

  const currentDayFingerprints = [...rowsByEtaDate.entries()].map(([eta_date, rows]) => ({
    eta_date,
    source_fingerprint: fingerprintEtaDay(rows),
    match_count: rows.length,
  }));
  const unchangedDays = new Set<string>();
  for (const day of currentDayFingerprints) {
    const previous = existingDayFingerprints.get(day.eta_date);
    if (
      previous?.source_fingerprint === day.source_fingerprint &&
      previous.match_count === day.match_count &&
      rowsByEtaDate.get(day.eta_date)?.every((row) => existingCache.get(row.match_id)?.eta_date === day.eta_date)
    ) {
      unchangedDays.add(day.eta_date);
    }
  }

  // Whole unchanged ETA days bypass per-row diff/upsert work. Missing IDs and
  // ETA moves invalidate the fast path; rows without ETA keep row-level checks.
  const changedCacheRows = cacheRows.filter((row) => {
    if (row.eta_date && unchangedDays.has(row.eta_date)) return false;
    const previous = existingCache.get(row.match_id);
    if (!previous) return true;
    const previousSlaMs = previous.sla_sort_at ? Date.parse(previous.sla_sort_at) : null;
    const nextSlaMs = row.sla_sort_at ? Date.parse(row.sla_sort_at) : null;
    const slaChanged = previousSlaMs === null && nextSlaMs === null
      ? false
      : previousSlaMs === null || nextSlaMs === null || previousSlaMs !== nextSlaMs;
    return previous.source_fingerprint !== row.source_fingerprint ||
      previous.eta_date !== row.eta_date ||
      slaChanged;
  });
  const changedRows = changedCacheRows.filter((row) => existingCache.has(row.match_id)).length;
  for (let offset = 0; offset < changedCacheRows.length; offset += 500) {
    const { error } = await supabase.from("match_master_cache").upsert(changedCacheRows.slice(offset, offset + 500), { onConflict: "match_id" });
    if (error) throw error;
  }

  // Reuse the existing cache index to remove IDs no longer present in the sheet.
  const sourceIds = new Set(cacheRows.map((row) => row.match_id));
  const staleIds = [...existingCache.keys()].filter((id) => !sourceIds.has(id));
  for (let offset = 0; offset < staleIds.length; offset += 500) {
    const { error } = await supabase.from("match_master_cache").delete().in("match_id", staleIds.slice(offset, offset + 500));
    if (error) throw error;
  }

  // Persist fingerprints only after cache writes/deletes succeed. Keep only dates
  // currently present in the source so reintroduced dates always receive a full sync.
  for (let offset = 0; offset < currentDayFingerprints.length; offset += 500) {
    const { error } = await supabase.from("match_master_eta_fingerprints")
      .upsert(currentDayFingerprints.slice(offset, offset + 500), { onConflict: "eta_date" });
    if (error) throw error;
  }
  const sourceDates = new Set(currentDayFingerprints.map((day) => day.eta_date));
  const obsoleteDates = [...existingDayFingerprints.keys()].filter((date) => !sourceDates.has(date));
  for (let offset = 0; offset < obsoleteDates.length; offset += 500) {
    const { error } = await supabase.from("match_master_eta_fingerprints").delete().in("eta_date", obsoleteDates.slice(offset, offset + 500));
    if (error) throw error;
  }

  // Keep a persistent 10-calendar-day window anchored to the newest ETA date
  // ever observed. It does not roll forward merely because the calendar changes,
  // and a backdated row cannot move the window backwards.
  const newestSourceEta = [...rowsByEtaDate.keys()].sort((a, b) => b.localeCompare(a))[0] ?? null;
  const { data: savedWindow, error: windowReadError } = await supabase
    .from("match_master_active_window")
    .select("window_start_date, window_end_date")
    .eq("singleton", true)
    .maybeSingle();
  if (windowReadError) throw windowReadError;

  let windowEndDate = savedWindow?.window_end_date ?? newestSourceEta;
  if (newestSourceEta && (!windowEndDate || newestSourceEta > windowEndDate)) {
    windowEndDate = newestSourceEta;
  }
  let windowStartDate: string | null = savedWindow?.window_start_date ?? null;
  if (windowEndDate && (!savedWindow || newestSourceEta && newestSourceEta > savedWindow.window_end_date)) {
    const end = new Date(`${windowEndDate}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() - 9);
    windowStartDate = end.toISOString().slice(0, 10);
  }

  let activeMatchCount = 0;
  if (windowStartDate && windowEndDate) {
    const { count, error } = await supabase.from("match_master_cache")
      .select("match_id", { count: "exact", head: true })
      .gte("eta_date", windowStartDate)
      .lte("eta_date", windowEndDate);
    if (error) throw error;
    activeMatchCount = count ?? 0;
    const { error: windowWriteError } = await supabase.from("match_master_active_window").upsert({
      singleton: true,
      window_start_date: windowStartDate,
      window_end_date: windowEndDate,
      active_match_count: activeMatchCount,
      updated_at: syncedAt,
    }, { onConflict: "singleton" });
    if (windowWriteError) throw windowWriteError;
  }

  return {
    sourceRows: cacheRows.length,
    changedRows,
    upsertedRows: changedCacheRows.length,
    deletedStaleRows: staleIds.length,
    etaDaysChecked: currentDayFingerprints.length,
    etaDaysUnchanged: unchangedDays.size,
    etaDaysChanged: currentDayFingerprints.length - unchangedDays.size,
    activeWindow: windowStartDate && windowEndDate ? {
      startDate: windowStartDate,
      endDate: windowEndDate,
      matchCount: activeMatchCount,
      warning: activeMatchCount > 300 ? "Active Match Master window exceeds 300 matches." : null,
    } : null,
    syncedAt,
  };
}

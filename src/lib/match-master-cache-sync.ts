import "server-only";

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
function toCacheRow(row: MatchMasterRow, syncedAt: string) {
  return {
    match_id: row.match_id,
    eta_date: normalizeEtaDate(row.eta),
    sla_sort_at: parseMatchMasterSla(row.sla),
    home_team: row.home_team,
    away_team: row.away_team,
    match_data: row,
    synced_at: syncedAt,
  };
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

  // Compare the sheet snapshot with the current cache before writing, so the
  // Admin UI can report how many existing match details (including SLA) changed.
  const existingCache = new Map<string, { match_data: Record<string, unknown> | null; sla_sort_at: string | null; eta_date: string | null }>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("match_master_cache")
      .select("match_id, match_data, sla_sort_at, eta_date")
      .order("match_id", { ascending: true })
      .range(offset, offset + 999);
    if (error) throw error;
    for (const row of data ?? []) {
      existingCache.set(row.match_id, {
        match_data: row.match_data as Record<string, unknown> | null,
        sla_sort_at: row.sla_sort_at,
        eta_date: row.eta_date,
      });
    }
    if (!data || data.length < 1000) break;
  }

  const changedRows = cacheRows.filter((row) => {
    const previous = existingCache.get(row.match_id);
    if (!previous) return false; // New rows are not counted as updated details.
    const previousData = previous.match_data ?? {};
    const metadataChanged = Object.keys(row.match_data).some((key) => {
      const before = previousData[key] == null ? "" : String(previousData[key]).trim();
      const currentValue = row.match_data[key as keyof MatchMasterRow];
      const after = currentValue == null ? "" : String(currentValue).trim();
      return before !== after;
    });
    const previousSlaMs = previous.sla_sort_at ? Date.parse(previous.sla_sort_at) : null;
    const nextSlaMs = row.sla_sort_at ? Date.parse(row.sla_sort_at) : null;
    const slaChanged = previousSlaMs === null && nextSlaMs === null
      ? false
      : previousSlaMs === null || nextSlaMs === null || previousSlaMs !== nextSlaMs;
    return slaChanged ||
      previous.eta_date !== row.eta_date ||
      metadataChanged;
  }).length;

  for (let offset = 0; offset < cacheRows.length; offset += 500) {
    const { error } = await supabase.from("match_master_cache").upsert(cacheRows.slice(offset, offset + 500), { onConflict: "match_id" });
    if (error) throw error;
  }

  const existingIds: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("match_master_cache")
      .select("match_id")
      .order("match_id", { ascending: true })
      .range(offset, offset + 999);
    if (error) throw error;
    existingIds.push(...(data ?? []).map((row) => row.match_id));
    if (!data || data.length < 1000) break;
  }
  const sourceIds = new Set(cacheRows.map((row) => row.match_id));
  const staleIds = existingIds.filter((id) => !sourceIds.has(id));

  for (let offset = 0; offset < staleIds.length; offset += 500) {
    const { error } = await supabase.from("match_master_cache").delete().in("match_id", staleIds.slice(offset, offset + 500));
    if (error) throw error;
  }

  return {
    sourceRows: cacheRows.length,
    changedRows,
    deletedStaleRows: staleIds.length,
    syncedAt,
  };
}

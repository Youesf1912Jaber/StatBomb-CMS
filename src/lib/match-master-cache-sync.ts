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
function toCacheRow(row: MatchMasterRow, syncedAt: string) {
  return {
    match_id: row.match_id,
    eta_date: normalizeEtaDate(row.eta),
    sla_sort_at: parseMatchMasterSla(row.sla),
    home_team: row.home_team,
    away_team: row.away_team,
    match_data: row,
    source_fingerprint: createHash("sha256").update(JSON.stringify(row)).digest("hex"),
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

  // Read only small index metadata, not each match_data JSON document. The
  // fingerprint allows periodic syncs to skip unchanged cache rows entirely.
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

  const changedCacheRows = cacheRows.filter((row) => {
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

  // Reuse the existing cache index instead of issuing another full scan.
  const sourceIds = new Set(cacheRows.map((row) => row.match_id));
  const staleIds = [...existingCache.keys()].filter((id) => !sourceIds.has(id));

  for (let offset = 0; offset < staleIds.length; offset += 500) {
    const { error } = await supabase.from("match_master_cache").delete().in("match_id", staleIds.slice(offset, offset + 500));
    if (error) throw error;
  }

  return {
    sourceRows: cacheRows.length,
    changedRows,
    upsertedRows: changedCacheRows.length,
    deletedStaleRows: staleIds.length,
    syncedAt,
  };
}

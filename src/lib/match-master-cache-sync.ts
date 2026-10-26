import "server-only";

import { normalizeEtaDate } from "@/lib/match-master-date";
import { readMatchesMasterSheet, type MatchMasterRow } from "@/lib/sync/google-sheets";
import { createServiceRoleClient } from "@/lib/supabase/server";

function parseSla(value: string | null): string | null {
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
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function toCacheRow(row: MatchMasterRow, syncedAt: string) {
  return {
    match_id: row.match_id,
    eta_date: normalizeEtaDate(row.eta),
    sla_sort_at: parseSla(row.sla),
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
  const cacheRows = sourceRows.map((row) => toCacheRow(row, syncedAt));
  const supabase = createServiceRoleClient();

  for (let offset = 0; offset < cacheRows.length; offset += 500) {
    const { error } = await supabase.from("match_master_cache").upsert(cacheRows.slice(offset, offset + 500), { onConflict: "match_id" });
    if (error) throw error;
  }

  const { data: existing, error: readError } = await supabase.from("match_master_cache").select("match_id");
  if (readError) throw readError;
  const sourceIds = new Set(cacheRows.map((row) => row.match_id));
  const staleIds = (existing ?? []).map((row) => row.match_id).filter((id) => !sourceIds.has(id));

  for (let offset = 0; offset < staleIds.length; offset += 500) {
    const { error } = await supabase.from("match_master_cache").delete().in("match_id", staleIds.slice(offset, offset + 500));
    if (error) throw error;
  }

  return {
    sourceRows: cacheRows.length,
    deletedStaleRows: staleIds.length,
    syncedAt,
  };
}

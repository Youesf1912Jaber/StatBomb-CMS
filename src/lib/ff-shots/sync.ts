import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { readFfShots2026Sheet } from "@/lib/sync/google-sheets";
import type { Database, FfShotRow, ProfileRow } from "@/types/database.types";
import {
  buildFfShotOccurrences,
  ffShotSimilarityKey,
  parseFfShotReviewDate,
  parseFfShotTimestamp,
  type FfShotCanonicalFields,
  type FfShotOccurrence,
} from "./identity";

type Client = SupabaseClient<Database>;

const PAGE_SIZE = 1000;
const WRITE_CHUNK_SIZE = 100;

export type FfShotSyncResult = {
  sheetRows: number;
  inserted: number;
  updated: number;
  unchanged: number;
  missing: number;
  total: number;
};

function nullableText(value: string): string | null {
  return value === "" ? null : value;
}

function occurrenceFields(occurrence: FfShotOccurrence): FfShotCanonicalFields {
  return occurrence.fields;
}

function similarityFromRow(row: FfShotRow): string {
  return [
    row.match_external_id,
    row.hr_code,
    row.event_timestamp_raw ?? "",
    row.player_id ?? "",
    row.half ?? "",
    row.side ?? "",
  ].join("|");
}

async function fetchAllFfShots(client: Client): Promise<FfShotRow[]> {
  const rows: FfShotRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from("ff_shots")
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

async function fetchAllProfiles(client: Client): Promise<ProfileRow[]> {
  const rows: ProfileRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from("profiles")
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

function collectorIdForHrCode(
  hrCode: string,
  byHr: Map<string, string>
): string | null {
  if (!hrCode) return null;
  return byHr.get(hrCode.toLowerCase()) ?? null;
}

function toInsert(
  occurrence: FfShotOccurrence,
  collectorId: string | null,
  now: string
): Database["public"]["Tables"]["ff_shots"]["Insert"] {
  const fields = occurrence.fields;
  return {
    source_key: occurrence.source_key,
    content_fingerprint: occurrence.content_fingerprint,
    occurrence_ordinal: occurrence.occurrence_ordinal,
    match_external_id: fields.match_id,
    app: nullableText(fields.app),
    hr_code: fields.hr_code,
    collector_name: nullableText(fields.collector_name),
    collector_id: collectorId,
    squad: nullableText(fields.squad),
    side: nullableText(fields.side),
    half: nullableText(fields.half),
    event_timestamp: parseFfShotTimestamp(fields.timestamp),
    event_timestamp_raw: nullableText(fields.timestamp),
    player_id: nullableText(fields.player_id),
    review_date: parseFfShotReviewDate(fields.review_date),
    review_date_raw: nullableText(fields.review_date),
    comment: nullableText(fields.comment),
    link: nullableText(fields.link),
    correct_collector: nullableText(fields.correct_collector),
    changed: nullableText(fields.changed),
    source_present: true,
    last_seen_at: now,
    first_synced_at: now,
    last_synced_at: now,
  };
}

function toUpdate(
  occurrence: FfShotOccurrence,
  collectorId: string | null,
  now: string
): Database["public"]["Tables"]["ff_shots"]["Update"] {
  const fields = occurrence.fields;
  return {
    source_key: occurrence.source_key,
    content_fingerprint: occurrence.content_fingerprint,
    occurrence_ordinal: occurrence.occurrence_ordinal,
    match_external_id: fields.match_id,
    app: nullableText(fields.app),
    hr_code: fields.hr_code,
    collector_name: nullableText(fields.collector_name),
    collector_id: collectorId,
    squad: nullableText(fields.squad),
    side: nullableText(fields.side),
    half: nullableText(fields.half),
    event_timestamp: parseFfShotTimestamp(fields.timestamp),
    event_timestamp_raw: nullableText(fields.timestamp),
    player_id: nullableText(fields.player_id),
    review_date: parseFfShotReviewDate(fields.review_date),
    review_date_raw: nullableText(fields.review_date),
    comment: nullableText(fields.comment),
    link: nullableText(fields.link),
    correct_collector: nullableText(fields.correct_collector),
    changed: nullableText(fields.changed),
    source_present: true,
    last_seen_at: now,
    last_synced_at: now,
  };
}

async function insertChunk(client: Client, rows: Database["public"]["Tables"]["ff_shots"]["Insert"][]) {
  for (let i = 0; i < rows.length; i += WRITE_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + WRITE_CHUNK_SIZE);
    const { error } = await client.from("ff_shots").insert(chunk);
    if (error) throw error;
  }
}

async function touchPresent(client: Client, ids: string[], now: string) {
  for (let i = 0; i < ids.length; i += WRITE_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + WRITE_CHUNK_SIZE);
    const { error } = await client
      .from("ff_shots")
      .update({
        source_present: true,
        last_seen_at: now,
        last_synced_at: now,
      })
      .in("id", chunk);
    if (error) throw error;
  }
}

async function markMissing(client: Client, ids: string[], now: string) {
  for (let i = 0; i < ids.length; i += WRITE_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + WRITE_CHUNK_SIZE);
    const { error } = await client
      .from("ff_shots")
      .update({
        source_present: false,
        last_synced_at: now,
      })
      .in("id", chunk);
    if (error) throw error;
  }
}

export async function syncFfShots(client: Client): Promise<FfShotSyncResult> {
  const [sourceRows, existing, profiles] = await Promise.all([
    readFfShots2026Sheet(),
    fetchAllFfShots(client),
    fetchAllProfiles(client),
  ]);
  const occurrences = buildFfShotOccurrences(sourceRows);
  const now = new Date().toISOString();
  const profilesByHr = new Map<string, string>();
  for (const profile of profiles) {
    if (profile.hr_code) {
      profilesByHr.set(profile.hr_code.trim().toLowerCase(), profile.id);
    }
  }

  const existingByKey = new Map(existing.map((row) => [row.source_key, row]));
  const matchedExistingIds = new Set<string>();
  const leftoverOccurrences: FfShotOccurrence[] = [];
  const unchangedIds: string[] = [];

  for (const occurrence of occurrences) {
    const match = existingByKey.get(occurrence.source_key);
    if (match) {
      matchedExistingIds.add(match.id);
      unchangedIds.push(match.id);
    } else {
      leftoverOccurrences.push(occurrence);
    }
  }

  const leftoverExisting = existing.filter((row) => !matchedExistingIds.has(row.id));
  const leftoverPresent = leftoverExisting.filter((row) => row.source_present);
  const leftoverBySimilarity = new Map<string, FfShotRow[]>();
  for (const row of leftoverPresent) {
    const key = similarityFromRow(row);
    const list = leftoverBySimilarity.get(key) ?? [];
    list.push(row);
    leftoverBySimilarity.set(key, list);
  }
  const leftoverOccurrenceBySimilarity = new Map<string, FfShotOccurrence[]>();
  for (const occurrence of leftoverOccurrences) {
    const key = ffShotSimilarityKey(occurrenceFields(occurrence));
    const list = leftoverOccurrenceBySimilarity.get(key) ?? [];
    list.push(occurrence);
    leftoverOccurrenceBySimilarity.set(key, list);
  }

  const toInsertRows: Database["public"]["Tables"]["ff_shots"]["Insert"][] = [];
  let updated = 0;
  const updatedExistingIds = new Set<string>();

  const claimedOccurrenceKeys = new Set<string>();
  for (const [similarity, sheetGroup] of leftoverOccurrenceBySimilarity) {
    const dbGroup = leftoverBySimilarity.get(similarity) ?? [];
    const occurrence = sheetGroup[0];
    const existingRow = dbGroup[0];
    if (sheetGroup.length === 1 && dbGroup.length === 1 && occurrence && existingRow) {
      const collectorId = collectorIdForHrCode(occurrence.fields.hr_code, profilesByHr);
      const { error } = await client
        .from("ff_shots")
        .update(toUpdate(occurrence, collectorId, now))
        .eq("id", existingRow.id);
      if (error) throw error;
      updated += 1;
      updatedExistingIds.add(existingRow.id);
      claimedOccurrenceKeys.add(occurrence.source_key);
      continue;
    }
    for (const occurrence of sheetGroup) {
      if (claimedOccurrenceKeys.has(occurrence.source_key)) continue;
      toInsertRows.push(
        toInsert(occurrence, collectorIdForHrCode(occurrence.fields.hr_code, profilesByHr), now)
      );
    }
  }

  if (toInsertRows.length > 0) {
    await insertChunk(client, toInsertRows);
  }
  if (unchangedIds.length > 0) {
    await touchPresent(client, unchangedIds, now);
  }

  const missingIds = leftoverPresent
    .filter((row) => !updatedExistingIds.has(row.id))
    .map((row) => row.id);
  if (missingIds.length > 0) {
    await markMissing(client, missingIds, now);
  }

  const inserted = toInsertRows.length;
  const unchanged = unchangedIds.length;
  const total = existing.length + inserted;

  return {
    sheetRows: occurrences.length,
    inserted,
    updated,
    unchanged,
    missing: missingIds.length,
    total,
  };
}

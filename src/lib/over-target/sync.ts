import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MatchRow, OverTargetRow, ProfileRow } from "@/types/database.types";
import {
  OVER_TARGET_SHEET_SOURCE,
  buildOverTargetOccurrences,
  isRetryableAppOverTargetRow,
  parseImportedOverTargetCount,
  parseOverTargetDone,
  parseOverTargetWeekDate,
  planOverTargetHistoricalImport,
  type OverTargetAssignmentLink,
  type OverTargetOccurrence,
} from "./identity";
import { writeOverTargetSheetForRow } from "./create";
import { getRetryableOverTargetRecords } from "./queries";
import { OVER_TARGET_SHEET_GID, OVER_TARGET_SHEET_TAB, readOverTargetSheet } from "./sheet";

type Client = SupabaseClient<Database>;

const PAGE_SIZE = 1000;
const WRITE_CHUNK_SIZE = 100;

export type OverTargetSyncResult = {
  sheetRows: number;
  inserted: number;
  updated: number;
  unchanged: number;
  missing: number;
  total: number;
};

export type OverTargetRetryResult = {
  retried: number;
  synced: number;
  failed: number;
};

function nullableText(value: string): string | null {
  return value === "" ? null : value;
}

async function fetchAllOverTarget(client: Client): Promise<OverTargetRow[]> {
  const rows: OverTargetRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from("over_target")
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

async function fetchAssignmentLinks(client: Client, profiles: ProfileRow[]): Promise<OverTargetAssignmentLink[]> {
  const assignments: Array<{ id: string; match_id: string; collector_id: string }> = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from("assignments")
      .select("id, match_id, collector_id")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    assignments.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const matchIds = [...new Set(assignments.map((assignment) => assignment.match_id))];
  const matches: MatchRow[] = [];
  for (let i = 0; i < matchIds.length; i += 100) {
    const chunk = matchIds.slice(i, i + 100);
    if (chunk.length === 0) continue;
    const { data, error } = await client.from("matches").select("*").in("id", chunk);
    if (error) throw error;
    matches.push(...(data ?? []));
  }

  const matchesById = new Map(matches.map((match) => [match.id, match]));
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  return assignments.flatMap((assignment) => {
    const match = matchesById.get(assignment.match_id);
    const profile = profilesById.get(assignment.collector_id);
    if (!match) return [];
    return [
      {
        assignment_id: assignment.id,
        match_id: assignment.match_id,
        match_external_id: match.external_id,
        hr_code: profile?.hr_code ?? "",
      },
    ];
  });
}

function collectorIdForHrCode(hrCode: string, byHr: Map<string, string>): string | null {
  if (!hrCode) return null;
  return byHr.get(hrCode.toLowerCase()) ?? null;
}

function toInsert(
  occurrence: OverTargetOccurrence,
  assignmentId: string | null,
  matchId: string | null,
  collectorId: string | null,
  now: string
): Database["public"]["Tables"]["over_target"]["Insert"] {
  const fields = occurrence.fields;
  const week = parseOverTargetWeekDate(fields.week);
  const count = parseImportedOverTargetCount(fields.count);
  const done = parseOverTargetDone(fields.done);
  return {
    assignment_id: assignmentId,
    match_id: matchId,
    match_external_id: fields.match_id,
    week_date: week.iso,
    week_date_raw: nullableText(week.raw),
    hr_code: fields.hr_code,
    collector_id: collectorId,
    collector_name: nullableText(fields.collector),
    team: nullableText(fields.team),
    count_value: count.value,
    count_raw: nullableText(count.raw),
    done: done.value,
    done_raw: nullableText(done.raw),
    source: OVER_TARGET_SHEET_SOURCE,
    source_key: occurrence.source_key,
    content_fingerprint: occurrence.content_fingerprint,
    occurrence_ordinal: occurrence.occurrence_ordinal,
    sheet_row_number: occurrence.source_row_number,
    sheet_tab: OVER_TARGET_SHEET_TAB,
    sheet_gid: OVER_TARGET_SHEET_GID,
    sheet_sync_status: "imported",
    sheet_synced_at: now,
    last_sheet_error: null,
    source_present: true,
    last_seen_at: now,
    first_synced_at: now,
    last_synced_at: now,
  };
}

async function insertChunk(client: Client, rows: Database["public"]["Tables"]["over_target"]["Insert"][]) {
  for (let i = 0; i < rows.length; i += WRITE_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + WRITE_CHUNK_SIZE);
    const { error } = await client.from("over_target").insert(chunk);
    if (error) throw error;
  }
}

function toUpdate(
  occurrence: OverTargetOccurrence,
  existing: OverTargetRow,
  collectorId: string | null,
  now: string
): Database["public"]["Tables"]["over_target"]["Update"] {
  const fields = occurrence.fields;
  const week = parseOverTargetWeekDate(fields.week);
  const count = parseImportedOverTargetCount(fields.count);
  const done = parseOverTargetDone(fields.done);
  const identityChanged =
    canonicalizeOverTargetMatchId(existing.match_external_id) !== fields.match_id ||
    canonicalizeOverTargetHrCode(existing.hr_code) !== fields.hr_code;

  return {
    // A changed match/collector identity must not keep the old assignment link.
    // The admin view can resolve the new match by its current external ID.
    assignment_id: identityChanged ? null : existing.assignment_id,
    match_id: identityChanged ? null : existing.match_id,
    collector_id: identityChanged ? collectorId : existing.collector_id ?? collectorId,
    match_external_id: fields.match_id,
    week_date: week.iso,
    week_date_raw: nullableText(week.raw),
    hr_code: fields.hr_code,
    collector_name: nullableText(fields.collector),
    team: nullableText(fields.team),
    count_value: count.value,
    count_raw: nullableText(count.raw),
    done: done.value,
    done_raw: nullableText(done.raw),
    source_key: occurrence.source_key,
    content_fingerprint: occurrence.content_fingerprint,
    occurrence_ordinal: occurrence.occurrence_ordinal,
    sheet_row_number: occurrence.source_row_number,
    sheet_tab: OVER_TARGET_SHEET_TAB,
    sheet_gid: OVER_TARGET_SHEET_GID,
    sheet_sync_status: existing.source === OVER_TARGET_APP_SOURCE ? existing.sheet_sync_status : "imported",
    sheet_synced_at: now,
    last_sheet_error: null,
    source_present: true,
    last_seen_at: now,
    last_synced_at: now,
  };
}

async function updateMatchedRows(
  client: Client,
  matchedRows: Array<{ id: string; occurrence: OverTargetOccurrence }>,
  existing: OverTargetRow[],
  profilesByHr: Map<string, string>,
  now: string
): Promise<number> {
  const existingById = new Map(existing.map((row) => [row.id, row]));
  const changed: Array<{ id: string; update: Database["public"]["Tables"]["over_target"]["Update"] }> = [];

  for (const item of matchedRows) {
    const previous = existingById.get(item.id);
    if (!previous) continue;
    const occurrence = item.occurrence;
    const nextCollectorId = collectorIdForHrCode(occurrence.fields.hr_code, profilesByHr);
    const needsUpdate =
      previous.content_fingerprint !== occurrence.content_fingerprint ||
      previous.source_key !== occurrence.source_key ||
      previous.sheet_row_number !== occurrence.source_row_number ||
      !previous.source_present ||
      previous.sheet_tab !== OVER_TARGET_SHEET_TAB ||
      previous.sheet_gid !== OVER_TARGET_SHEET_GID;
    if (needsUpdate) {
      changed.push({
        id: item.id,
        update: toUpdate(occurrence, previous, nextCollectorId, now),
      });
    }
  }

  for (let i = 0; i < changed.length; i += WRITE_CHUNK_SIZE) {
    const chunk = changed.slice(i, i + WRITE_CHUNK_SIZE);
    const results = await Promise.all(chunk.map(async ({ id, update }) => {
      const { error } = await client.from("over_target").update(update).eq("id", id);
      if (error) throw error;
    }));
    void results;
  }
  return changed.length;
}

async function touchPresent(client: Client, ids: string[], now: string) {
  for (let i = 0; i < ids.length; i += WRITE_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + WRITE_CHUNK_SIZE);
    const { error } = await client
      .from("over_target")
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
      .from("over_target")
      .update({
        source_present: false,
        last_synced_at: now,
      })
      .in("id", chunk);
    if (error) throw error;
  }
}

export async function syncOverTarget(client: Client): Promise<OverTargetSyncResult> {
  const [sourceRows, existing, profiles] = await Promise.all([
    readOverTargetSheet(),
    fetchAllOverTarget(client),
    fetchAllProfiles(client),
  ]);
  const assignments = await fetchAssignmentLinks(client, profiles);
  const occurrences = buildOverTargetOccurrences(sourceRows);
  const plan = planOverTargetHistoricalImport(occurrences, existing, assignments);
  const now = new Date().toISOString();
  const profilesByHr = new Map<string, string>();
  for (const profile of profiles) {
    if (profile.hr_code) {
      profilesByHr.set(profile.hr_code.trim().toLowerCase(), profile.id);
    }
  }
  const assignmentsById = new Map(assignments.map((assignment) => [assignment.assignment_id, assignment]));

  const toInsertRows = plan.inserts.map((item) => {
    const assignment = item.assignment_id ? assignmentsById.get(item.assignment_id) ?? null : null;
    return toInsert(
      item.occurrence,
      item.assignment_id,
      assignment?.match_id ?? null,
      collectorIdForHrCode(item.occurrence.fields.hr_code, profilesByHr),
      now
    );
  });

  const updated = await updateMatchedRows(client, plan.matchedRows, existing, profilesByHr, now);

  if (toInsertRows.length > 0) {
    await insertChunk(client, toInsertRows);
  }
  if (plan.matchedIds.length > 0) {
    await touchPresent(client, plan.matchedIds, now);
  }
  if (plan.missingIds.length > 0) {
    await markMissing(client, plan.missingIds, now);
  }

  const total = existing.length + toInsertRows.length;
  return {
    sheetRows: occurrences.length,
    inserted: toInsertRows.length,
    updated,
    unchanged: Math.max(0, plan.matchedIds.length - updated),
    missing: plan.missingIds.length,
    total,
  };
}

export async function retryFailedOverTargetWrites(client: Client): Promise<OverTargetRetryResult> {
  const rows = await getRetryableOverTargetRecords(client);
  let synced = 0;
  let failed = 0;
  for (const row of rows) {
    if (!isRetryableAppOverTargetRow(row)) continue;
    const updated = await writeOverTargetSheetForRow(client, row);
    if (updated.sheet_sync_status === "synced") synced += 1;
    else failed += 1;
  }
  return {
    retried: rows.length,
    synced,
    failed,
  };
}

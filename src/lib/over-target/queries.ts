import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, OverTargetRow } from "@/types/database.types";
import {
  adminOverTargetCollectorMatchKey,
  mergeAdminOverTargetRecords,
  uniqueAdminAssignmentByCollectorMatch,
  type AdminOverTargetAssignmentDetails,
  type AdminOverTargetMatchDetails,
  type AdminOverTargetRecord,
} from "./admin-details";
import {
  mergeCollectorOverTargetRecords,
  type CollectorOverTargetAssignmentDetails,
  type CollectorOverTargetMatchDetails,
  type CollectorOverTargetRecord,
} from "./collector-details";
import { canonicalizeOverTargetHrCode } from "./identity";

type Client = SupabaseClient<Database>;

const PAGE_SIZE = 1000;
const LOOKUP_CHUNK_SIZE = 100;

export async function getAllOverTargetRecords(client: Client): Promise<OverTargetRow[]> {
  const rows: OverTargetRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from("over_target")
      .select("*")
      .eq("source_present", true)
      .order("week_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function getOverTargetRecordsForHrCode(
  client: Client,
  hrCode: string | null | undefined
): Promise<OverTargetRow[]> {
  const normalized = canonicalizeOverTargetHrCode(hrCode);
  if (!normalized) return [];

  const rows: OverTargetRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from("over_target")
      .select("*")
      .eq("source_present", true)
      .ilike("hr_code", normalized)
      .order("week_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows.filter((row) => canonicalizeOverTargetHrCode(row.hr_code) === normalized);
}

async function getCollectorOverTargetAssignmentDetails(
  client: Client,
  assignmentIds: string[]
): Promise<Map<string, CollectorOverTargetAssignmentDetails>> {
  const byId = new Map<string, CollectorOverTargetAssignmentDetails>();
  if (assignmentIds.length === 0) return byId;
  for (let i = 0; i < assignmentIds.length; i += LOOKUP_CHUNK_SIZE) {
    const chunk = assignmentIds.slice(i, i + LOOKUP_CHUNK_SIZE);
    const { data, error } = await client
      .from("assignments")
      .select("id, match_id, sla, status")
      .in("id", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      byId.set(row.id, row);
    }
  }
  return byId;
}

async function getCollectorOverTargetMatchDetails(
  client: Client,
  matchIds: string[]
): Promise<Map<string, CollectorOverTargetMatchDetails>> {
  const byId = new Map<string, CollectorOverTargetMatchDetails>();
  if (matchIds.length === 0) return byId;
  for (let i = 0; i < matchIds.length; i += LOOKUP_CHUNK_SIZE) {
    const chunk = matchIds.slice(i, i + LOOKUP_CHUNK_SIZE);
    const { data, error } = await client
      .from("matches")
      .select("id, home_team, away_team")
      .in("id", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      byId.set(row.id, row);
    }
  }
  return byId;
}

export async function getCollectorOverTargetRecords(
  client: Client,
  hrCode: string | null | undefined
): Promise<CollectorOverTargetRecord[]> {
  const records = await getOverTargetRecordsForHrCode(client, hrCode);
  if (records.length === 0) return [];

  const assignmentIds = [
    ...new Set(records.map((row) => row.assignment_id).filter((id): id is string => Boolean(id))),
  ];
  const assignmentById = await getCollectorOverTargetAssignmentDetails(client, assignmentIds);

  const matchIds = [
    ...new Set(
      records
        .map((row) => {
          const assignment = row.assignment_id ? assignmentById.get(row.assignment_id) : undefined;
          return assignment?.match_id ?? row.match_id;
        })
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const matchById = await getCollectorOverTargetMatchDetails(client, matchIds);

  return mergeCollectorOverTargetRecords(records, assignmentById, matchById);
}

async function getAdminOverTargetAssignmentDetails(
  client: Client,
  assignmentIds: string[]
): Promise<Map<string, AdminOverTargetAssignmentDetails>> {
  const byId = new Map<string, AdminOverTargetAssignmentDetails>();
  if (assignmentIds.length === 0) return byId;
  for (let i = 0; i < assignmentIds.length; i += LOOKUP_CHUNK_SIZE) {
    const chunk = assignmentIds.slice(i, i + LOOKUP_CHUNK_SIZE);
    const { data, error } = await client
      .from("assignments")
      .select("id, match_id, collector_id, sla, status")
      .in("id", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      byId.set(row.id, row);
    }
  }
  return byId;
}

async function getAdminOverTargetAssignmentsByCollectorMatch(
  client: Client,
  pairs: Array<{ collector_id: string; match_id: string }>
): Promise<AdminOverTargetAssignmentDetails[]> {
  const collectorIds = [...new Set(pairs.map((pair) => pair.collector_id))];
  const matchIds = [...new Set(pairs.map((pair) => pair.match_id))];
  if (collectorIds.length === 0 || matchIds.length === 0) return [];

  const pairKeys = new Set(
    pairs
      .map((pair) => adminOverTargetCollectorMatchKey(pair.collector_id, pair.match_id))
      .filter((key): key is string => Boolean(key))
  );
  const rows: AdminOverTargetAssignmentDetails[] = [];
  for (let i = 0; i < collectorIds.length; i += LOOKUP_CHUNK_SIZE) {
    const collectorChunk = collectorIds.slice(i, i + LOOKUP_CHUNK_SIZE);
    for (let j = 0; j < matchIds.length; j += LOOKUP_CHUNK_SIZE) {
      const matchChunk = matchIds.slice(j, j + LOOKUP_CHUNK_SIZE);
      const { data, error } = await client
        .from("assignments")
        .select("id, match_id, collector_id, sla, status")
        .in("collector_id", collectorChunk)
        .in("match_id", matchChunk);
      if (error) throw error;
      for (const row of data ?? []) {
        const key = adminOverTargetCollectorMatchKey(row.collector_id, row.match_id);
        if (key && pairKeys.has(key)) rows.push(row);
      }
    }
  }
  return rows;
}

async function getAdminOverTargetMatchDetailsById(
  client: Client,
  matchIds: string[]
): Promise<Map<string, AdminOverTargetMatchDetails>> {
  const byId = new Map<string, AdminOverTargetMatchDetails>();
  if (matchIds.length === 0) return byId;
  for (let i = 0; i < matchIds.length; i += LOOKUP_CHUNK_SIZE) {
    const chunk = matchIds.slice(i, i + LOOKUP_CHUNK_SIZE);
    const { data, error } = await client
      .from("matches")
      .select("id, external_id, home_team, away_team")
      .in("id", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      byId.set(row.id, row);
    }
  }
  return byId;
}

async function getAdminOverTargetMatchDetailsByExternalId(
  client: Client,
  externalIds: string[]
): Promise<Map<string, AdminOverTargetMatchDetails>> {
  const byExternalId = new Map<string, AdminOverTargetMatchDetails>();
  if (externalIds.length === 0) return byExternalId;
  for (let i = 0; i < externalIds.length; i += LOOKUP_CHUNK_SIZE) {
    const chunk = externalIds.slice(i, i + LOOKUP_CHUNK_SIZE);
    const { data, error } = await client
      .from("matches")
      .select("id, external_id, home_team, away_team")
      .in("external_id", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      if (!byExternalId.has(row.external_id)) byExternalId.set(row.external_id, row);
    }
  }
  return byExternalId;
}

export async function getAdminOverTargetRecords(client: Client): Promise<AdminOverTargetRecord[]> {
  const records = await getAllOverTargetRecords(client);
  if (records.length === 0) return [];

  const assignmentIds = [
    ...new Set(records.map((row) => row.assignment_id).filter((id): id is string => Boolean(id))),
  ];
  const assignmentById = await getAdminOverTargetAssignmentDetails(client, assignmentIds);

  const matchIds = [
    ...new Set(
      records
        .map((row) => {
          const assignment = row.assignment_id ? assignmentById.get(row.assignment_id) : undefined;
          return assignment?.match_id ?? row.match_id;
        })
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const matchById = await getAdminOverTargetMatchDetailsById(client, matchIds);

  const unresolvedExternalIds = [
    ...new Set(
      records
        .filter((row) => {
          const assignment = row.assignment_id ? assignmentById.get(row.assignment_id) : undefined;
          const matchId = assignment?.match_id ?? row.match_id;
          if (matchId && matchById.has(matchId)) return false;
          return Boolean(row.match_external_id?.trim());
        })
        .map((row) => row.match_external_id.trim())
    ),
  ];
  const matchByExternalId = await getAdminOverTargetMatchDetailsByExternalId(client, unresolvedExternalIds);

  const fallbackPairs = records.flatMap((row) => {
    if (row.assignment_id?.trim()) return [];
    const collectorId = row.collector_id?.trim();
    if (!collectorId) return [];
    const matchId =
      row.match_id?.trim() ||
      (row.match_external_id?.trim() ? matchByExternalId.get(row.match_external_id.trim())?.id : undefined);
    if (!matchId) return [];
    return [{ collector_id: collectorId, match_id: matchId }];
  });
  const fallbackAssignments = await getAdminOverTargetAssignmentsByCollectorMatch(client, fallbackPairs);
  const assignmentByCollectorMatch = uniqueAdminAssignmentByCollectorMatch([
    ...assignmentById.values(),
    ...fallbackAssignments,
  ]);

  return mergeAdminOverTargetRecords(records, assignmentById, matchById, matchByExternalId, assignmentByCollectorMatch);
}

export async function getRetryableOverTargetRecords(client: Client): Promise<OverTargetRow[]> {
  const rows: OverTargetRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from("over_target")
      .select("*")
      .eq("source", "app")
      .in("sheet_sync_status", ["pending", "failed"])
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

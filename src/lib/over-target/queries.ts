import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, OverTargetRow } from "@/types/database.types";
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

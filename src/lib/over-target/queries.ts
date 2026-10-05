import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, OverTargetRow } from "@/types/database.types";
import { canonicalizeOverTargetHrCode } from "./identity";

type Client = SupabaseClient<Database>;

const PAGE_SIZE = 1000;

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

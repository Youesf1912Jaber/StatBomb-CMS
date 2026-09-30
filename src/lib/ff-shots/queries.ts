import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, FfShotRow } from "@/types/database.types";
import { canonicalizeFfShotHrCode } from "./identity";

type Client = SupabaseClient<Database>;

const PAGE_SIZE = 1000;

export async function getAllFfShots(client: Client): Promise<FfShotRow[]> {
  const rows: FfShotRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from("ff_shots")
      .select("*")
      .eq("source_present", true)
      .order("review_date", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function getFfShotsForHrCode(
  client: Client,
  hrCode: string | null | undefined
): Promise<FfShotRow[]> {
  const normalized = canonicalizeFfShotHrCode(hrCode);
  if (!normalized) return [];

  const rows: FfShotRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from("ff_shots")
      .select("*")
      .eq("source_present", true)
      .ilike("hr_code", normalized)
      .order("review_date", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows.filter((row) => canonicalizeFfShotHrCode(row.hr_code) === normalized);
}

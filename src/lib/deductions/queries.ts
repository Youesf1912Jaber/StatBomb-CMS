import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, DeductionRow } from "@/types/database.types";
import { canonicalizeDeductionHrCode } from "./identity";

type Client = SupabaseClient<Database>;

const PAGE_SIZE = 1000;

export async function getAllDeductions(client: Client): Promise<DeductionRow[]> {
  const rows: DeductionRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from("deductions")
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

export async function getDeductionsForHrCode(
  client: Client,
  hrCode: string | null | undefined
): Promise<DeductionRow[]> {
  const normalized = canonicalizeDeductionHrCode(hrCode);
  if (!normalized) return [];

  const rows: DeductionRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from("deductions")
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
  return rows.filter((row) => canonicalizeDeductionHrCode(row.hr_code) === normalized);
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnnualLeaveLedgerRow, Database } from "../../types/database.types";
import type { ExpectedWeekBlock } from "../expected/types";
import {
  extractDesiredLeaves,
  normalizeLeaveHrCode,
  planAnnualLeaveLedger,
  type AnnualLeaveLedgerPlan,
} from "./ledger";
import { annualLeaveSheetSyncPendingFields } from "./sheet-sync-status";

type Client = SupabaseClient<Database>;

const PAGE_SIZE = 1000;
const WRITE_CHUNK_SIZE = 100;

export type AnnualLeaveLedgerSyncResult = {
  inserted: number;
  consumed: number;
  reversed: number;
};

async function fetchAllLedgerRows(client: Client): Promise<AnnualLeaveLedgerRow[]> {
  const rows: AnnualLeaveLedgerRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from("annual_leave_ledger")
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

async function fetchProfilesByHrCode(client: Client): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from("profiles")
      .select("id, hr_code")
      .not("hr_code", "is", null)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    for (const row of page) {
      const hrCode = normalizeLeaveHrCode(row.hr_code);
      if (hrCode) map.set(hrCode, row.id);
    }
    if (page.length < PAGE_SIZE) break;
  }
  return map;
}

async function insertRows(client: Client, rows: AnnualLeaveLedgerPlan["inserts"]): Promise<void> {
  for (let i = 0; i < rows.length; i += WRITE_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + WRITE_CHUNK_SIZE);
    const { error } = await client.from("annual_leave_ledger").insert(chunk);
    if (error) throw error;
  }
}

async function applyConsumeUpdates(
  client: Client,
  rows: AnnualLeaveLedgerPlan["consumeUpdates"]
): Promise<void> {
  for (const row of rows) {
    const { error } = await client
      .from("annual_leave_ledger")
      .update({
        action: "consume",
        collector_id: row.collector_id,
        source_week: row.source_week,
        source_cell: row.source_cell,
        ...annualLeaveSheetSyncPendingFields(),
      })
      .eq("id", row.id);
    if (error) throw error;
  }
}

async function applyReverseUpdates(
  client: Client,
  rows: AnnualLeaveLedgerPlan["reverseUpdates"]
): Promise<void> {
  for (const row of rows) {
    const { error } = await client
      .from("annual_leave_ledger")
      .update({ action: "reverse", ...annualLeaveSheetSyncPendingFields() })
      .eq("id", row.id);
    if (error) throw error;
  }
}

export async function reconcileAnnualLeaveLedger(
  client: Client,
  weeks: ExpectedWeekBlock[]
): Promise<AnnualLeaveLedgerSyncResult> {
  const [existing, profilesByHrCode] = await Promise.all([
    fetchAllLedgerRows(client),
    fetchProfilesByHrCode(client),
  ]);
  const plan = planAnnualLeaveLedger({
    desired: extractDesiredLeaves(weeks),
    existing,
    profilesByHrCode,
  });

  if (plan.inserts.length > 0) await insertRows(client, plan.inserts);
  if (plan.consumeUpdates.length > 0) await applyConsumeUpdates(client, plan.consumeUpdates);
  if (plan.reverseUpdates.length > 0) await applyReverseUpdates(client, plan.reverseUpdates);

  return {
    inserted: plan.inserts.length,
    consumed: plan.consumeUpdates.length,
    reversed: plan.reverseUpdates.length,
  };
}

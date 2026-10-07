import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnnualLeaveAction, AnnualLeaveType, Database } from "../../types/database.types";
import {
  buildAnnualSpareBalances,
  findAnnualSpareBalanceForHrCode,
  normalizeBalanceHrCode,
  type AnnualSpareBalance,
  type LedgerUsageInput,
} from "./balance";
import { readAnnualSpareSheet } from "./sheet";

type Client = SupabaseClient<Database>;

const PAGE_SIZE = 1000;

async function fetchConsumeLedgerRows(client: Client, hrCode?: string): Promise<LedgerUsageInput[]> {
  const rows: LedgerUsageInput[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = client
      .from("annual_leave_ledger")
      .select("hr_code, leave_type, action")
      .eq("action", "consume")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (hrCode) query = query.ilike("hr_code", hrCode);
    const { data, error } = await query;
    if (error) throw error;
    const page = data ?? [];
    for (const row of page) {
      rows.push({
        hr_code: row.hr_code,
        leave_type: row.leave_type as AnnualLeaveType,
        action: row.action as AnnualLeaveAction,
      });
    }
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function listAnnualSpareBalances(client: Client): Promise<AnnualSpareBalance[]> {
  const [spareRows, ledgerRows] = await Promise.all([
    readAnnualSpareSheet(),
    fetchConsumeLedgerRows(client),
  ]);
  return buildAnnualSpareBalances(spareRows, ledgerRows);
}

export async function getAnnualSpareBalanceForHrCode(
  client: Client,
  hrCode: string | null | undefined
): Promise<AnnualSpareBalance | null> {
  const normalized = normalizeBalanceHrCode(hrCode);
  if (!normalized) return null;
  const [spareRows, ledgerRows] = await Promise.all([
    readAnnualSpareSheet(),
    fetchConsumeLedgerRows(client, normalized),
  ]);
  return findAnnualSpareBalanceForHrCode(spareRows, ledgerRows, normalized);
}

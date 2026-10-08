import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnnualLeaveLedgerRow, Database } from "../../types/database.types";
import {
  annualLeaveSheetSyncFailedFields,
  annualLeaveSheetSyncPendingFields,
  annualLeaveSheetSyncWrittenFields,
} from "./sheet-sync-status";

type Client = SupabaseClient<Database>;

const PAGE_SIZE = 1000;

export async function getPendingAnnualLeaveSheetSyncRows(
  client: Client
): Promise<AnnualLeaveLedgerRow[]> {
  const rows: AnnualLeaveLedgerRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from("annual_leave_ledger")
      .select("*")
      .eq("sheet_sync_status", "pending")
      .order("updated_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function markAnnualLeaveSheetSyncWritten(
  client: Client,
  id: string,
  appliedAt: string = new Date().toISOString()
): Promise<void> {
  const { error } = await client
    .from("annual_leave_ledger")
    .update(annualLeaveSheetSyncWrittenFields(appliedAt))
    .eq("id", id)
    .eq("sheet_sync_status", "pending");
  if (error) throw error;
}

export async function markAnnualLeaveSheetSyncFailed(
  client: Client,
  id: string,
  errorMessage: string
): Promise<void> {
  const { error } = await client
    .from("annual_leave_ledger")
    .update(annualLeaveSheetSyncFailedFields(errorMessage))
    .eq("id", id)
    .eq("sheet_sync_status", "pending");
  if (error) throw error;
}

export async function requeueFailedAnnualLeaveSheetSyncRows(
  client: Client,
  ids: string[]
): Promise<string[]> {
  if (ids.length === 0) return [];
  const requeued: string[] = [];
  for (const id of ids) {
    const { data, error } = await client
      .from("annual_leave_ledger")
      .update(annualLeaveSheetSyncPendingFields())
      .eq("id", id)
      .eq("sheet_sync_status", "failed")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (data?.id) requeued.push(data.id);
  }
  return requeued;
}

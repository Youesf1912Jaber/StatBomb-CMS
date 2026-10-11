import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAssignmentById } from "@/lib/assignments/queries";
import { PreviewInputError } from "@/lib/sync/preview";
import type { Database, OverTargetRow, ProfileRow } from "@/types/database.types";
import {
  OVER_TARGET_APP_SOURCE,
  canonicalFieldsFromApp,
  formatOverTargetWeekDate,
  overTargetAppSourceKey,
  overTargetContentFingerprint,
  parseOverTargetWeekDate,
  parseRequiredOverTargetCount,
} from "./identity";
import { OVER_TARGET_SHEET_GID, OVER_TARGET_SHEET_TAB, appendOverTargetRow } from "./sheet";

type Client = SupabaseClient<Database>;

export type CreateOverTargetInput = {
  assignmentId: string;
  weekDate: unknown;
  count: unknown;
  createdBy?: string | null;
};

export type CreateOverTargetResult =
  | { ok: true; record: OverTargetRow }
  | {
      ok: false;
      error: string;
      code: "NOT_FOUND" | "DUPLICATE" | "INVALID_COUNT" | "INVALID_WEEK" | "MISSING_HR";
    };

function sheetErrorMessage(error: unknown): string {
  if (error instanceof PreviewInputError) return error.safeMessage;
  return "Unable to write Over Target to Google Sheets.";
}

async function fetchCollector(client: Client, collectorId: string): Promise<ProfileRow | null> {
  const { data, error } = await client.from("profiles").select("*").eq("id", collectorId).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function fetchExistingForAssignment(client: Client, assignmentId: string): Promise<OverTargetRow | null> {
  const { data, error } = await client
    .from("over_target")
    .select("*")
    .eq("assignment_id", assignmentId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function createOverTargetRecord(
  client: Client,
  input: CreateOverTargetInput
): Promise<CreateOverTargetResult> {
  const count = parseRequiredOverTargetCount(input.count);
  if (!count.ok) {
    return { ok: false, error: count.error, code: "INVALID_COUNT" };
  }

  const week = parseOverTargetWeekDate(input.weekDate);
  if (!week.iso) {
    return {
      ok: false,
      error: "Week is required and must be a valid Over Target distribution date.",
      code: "INVALID_WEEK",
    };
  }
  const weekRaw = week.raw.includes("-") ? formatOverTargetWeekDate(week.iso) : week.raw || formatOverTargetWeekDate(week.iso);

  const assignment = await getAssignmentById(client, input.assignmentId);
  if (!assignment) {
    return { ok: false, error: "That assignment could not be found.", code: "NOT_FOUND" };
  }

  const existing = await fetchExistingForAssignment(client, assignment.id);
  if (existing) {
    return { ok: false, error: "This assignment already has an Over Target record.", code: "DUPLICATE" };
  }

  const collector = await fetchCollector(client, assignment.collector_id);
  const hrCode = (collector?.hr_code ?? "").trim().toUpperCase();
  if (!hrCode) {
    return {
      ok: false,
      error: "No HR-Code is set on this collector, so Over Target cannot be created.",
      code: "MISSING_HR",
    };
  }

  const collectorName = collector?.full_name ?? collector?.email ?? null;
  const team = collector?.team ?? null;
  const fields = canonicalFieldsFromApp({
    matchExternalId: assignment.match.external_id,
    weekRaw,
    hrCode,
    team: team ?? "",
    collector: collectorName ?? "",
    count: count.value,
  });
  const now = new Date().toISOString();
  const insert: Database["public"]["Tables"]["over_target"]["Insert"] = {
    assignment_id: assignment.id,
    match_id: assignment.match_id,
    match_external_id: assignment.match.external_id,
    week_date: week.iso,
    week_date_raw: weekRaw,
    hr_code: hrCode,
    collector_id: assignment.collector_id,
    collector_name: collectorName,
    team,
    count_value: count.value,
    count_raw: String(count.value),
    done: null,
    done_raw: null,
    source: OVER_TARGET_APP_SOURCE,
    source_key: overTargetAppSourceKey(assignment.id),
    content_fingerprint: overTargetContentFingerprint(fields),
    occurrence_ordinal: 1,
    sheet_row_number: null,
    sheet_tab: OVER_TARGET_SHEET_TAB,
    sheet_gid: OVER_TARGET_SHEET_GID,
    sheet_sync_status: "pending",
    sheet_synced_at: null,
    last_sheet_error: null,
    source_present: true,
    last_seen_at: now,
    first_synced_at: now,
    last_synced_at: now,
    created_by: input.createdBy ?? null,
  };

  const { data: created, error: insertError } = await client
    .from("over_target")
    .insert(insert)
    .select("*")
    .single();

  if (insertError) {
    const existingAfterConflict = await fetchExistingForAssignment(client, assignment.id);
    if (existingAfterConflict) {
      return { ok: false, error: "This assignment already has an Over Target record.", code: "DUPLICATE" };
    }
    throw insertError;
  }

  return { ok: true, record: await writeOverTargetSheetForRow(client, created) };
}

export async function writeOverTargetSheetForRow(client: Client, row: OverTargetRow): Promise<OverTargetRow> {
  const weekRaw = row.week_date_raw || (row.week_date ? formatOverTargetWeekDate(row.week_date) : "");
  if (!row.count_value || !row.match_external_id || !row.hr_code || !weekRaw) {
    const now = new Date().toISOString();
    const { data, error } = await client
      .from("over_target")
      .update({
        sheet_sync_status: "failed",
        last_sheet_error: "Over Target row is missing required sheet fields.",
        last_synced_at: now,
      })
      .eq("id", row.id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  try {
    const written = await appendOverTargetRow({
      match_id: row.match_external_id,
      week: weekRaw,
      hr_code: row.hr_code,
      team: row.team ?? "",
      collector: row.collector_name ?? "",
      count: row.count_value,
    });
    const now = new Date().toISOString();
    const { data, error } = await client
      .from("over_target")
      .update({
        sheet_sync_status: "synced",
        sheet_row_number: written.sheet_row_number,
        sheet_tab: written.sheet_tab,
        sheet_gid: written.sheet_gid,
        sheet_synced_at: now,
        last_sheet_error: null,
        source_present: true,
        last_synced_at: now,
        last_seen_at: now,
      })
      .eq("id", row.id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    const now = new Date().toISOString();
    const { data, error: updateError } = await client
      .from("over_target")
      .update({
        sheet_sync_status: "failed",
        last_sheet_error: sheetErrorMessage(error),
        last_synced_at: now,
      })
      .eq("id", row.id)
      .select("*")
      .single();
    if (updateError) throw updateError;
    return data;
  }
}

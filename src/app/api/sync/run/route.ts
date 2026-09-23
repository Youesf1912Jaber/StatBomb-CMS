import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { persistReconciledDistributionPresence } from "@/lib/sync/persist-distribution-presence";
import { pullDistributionSheet, readDistributionRowsForPreview } from "@/lib/sync/google-sheets";
import {
  loadPreviewContext,
  parsePreviewSourceRows,
  PREVIEW_STATUS,
  PreviewInputError,
  toSyncRunMetadata,
} from "@/lib/sync/preview";

export const runtime = "nodejs";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const authClient = createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return errorResponse("Authentication required.", 401);

  const { data: profile, error: profileError } = await authClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profileError || profile?.role !== "admin") {
    return errorResponse("Admin access required.", 403);
  }

  const serviceClient = createServiceRoleClient();
  let pull;
  try {
    pull = await pullDistributionSheet();
  } catch (error) {
    return errorResponse(error instanceof PreviewInputError ? error.safeMessage : "Google Sheets could not be read.", 422);
  }
  const runInsert = await serviceClient
    .from("sync_runs")
    .insert({
      created_by: user.id,
      source: "google_sheets",
      file_name: null,
      file_size: null,
      metadata: {
        spreadsheet_id: pull.spreadsheetId,
        sheet_name: pull.sheetName,
        pulled_at: pull.pulledAt,
      },
      status: PREVIEW_STATUS,
    })
    .select("id")
    .single();

  if (runInsert.error || !runInsert.data) {
    return errorResponse("Unable to create the sync preview run.", 500);
  }

  const runId = runInsert.data.id;
  try {
    const context = await loadPreviewContext(serviceClient);
    const result = parsePreviewSourceRows(pull.rows, context);
    const distributionRows = await readDistributionRowsForPreview();
    await persistReconciledDistributionPresence(serviceClient, {
      distributionRows,
      assignments: context.assignments,
      matches: context.matches,
    });
    const update = await serviceClient
      .from("sync_runs")
      .update({
        sheets: { names: result.sheets },
        metadata: {
          ...toSyncRunMetadata(result),
          spreadsheet_id: pull.spreadsheetId,
          sheet_name: pull.sheetName,
          pulled_at: pull.pulledAt,
        },
        total_rows: result.summary.total_rows,
        rows_imported: result.summary.rows_imported,
        rows_updated: result.summary.rows_updated,
        rows_reassigned: result.summary.rows_reassigned,
        rows_skipped: result.summary.rows_skipped,
        rows_errored: result.summary.rows_errored,
      })
      .eq("id", runId);
    if (update.error) throw new Error("Unable to persist the sync preview.");

    const issueRows = result.candidates.flatMap((candidate) =>
      candidate.issues.map((item) => ({
        sync_run_id: runId,
        row_number: item.row_number,
        row_key: candidate.external_id,
        match_id: candidate.match_id,
        assignment_id: candidate.assignment_id,
        row_data: {
          external_id: candidate.external_id,
          collector_hr_code: candidate.collector_hr_code,
          collector_name: candidate.collector_name,
          raw_task_value: candidate.raw_task_value,
          task: candidate.task,
          half: candidate.half,
          shift_date: candidate.shift_date,
          official_website_url: candidate.official_website_url,
          match_candidate: candidate.match_candidate,
        },
        severity: item.severity,
        issue_type: item.issue_type,
        message: item.message,
      }))
    );
    if (issueRows.length > 0) {
      const issues = await serviceClient.from("sync_row_issues").insert(issueRows);
      if (issues.error) throw new Error("Unable to persist sync preview issues.");
    }

    return NextResponse.json({
      sync_run_id: runId,
      status: PREVIEW_STATUS,
      source: "google_sheets",
      sheet_name: pull.sheetName,
      spreadsheet_id: pull.spreadsheetId,
      pulled_at: pull.pulledAt,
      sheets: result.sheets,
      summary: result.summary,
      outcomes: result.candidates,
    });
  } catch (error) {
    await serviceClient
      .from("sync_runs")
      .update({
        total_rows: 0,
        rows_errored: 1,
        metadata: { preview_error: "The workbook could not be processed." },
      })
      .eq("id", runId);
    if (error instanceof PreviewInputError) {
      return errorResponse(error.safeMessage, 422);
    }
    return errorResponse("The workbook could not be processed.", 422);
  }
}

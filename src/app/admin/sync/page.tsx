import { createClient } from "@/lib/supabase/server";
import { SyncPreviewClient } from "@/components/SyncPreviewClient";

export default async function AdminSyncPage() {
  const supabase = createClient();
  const { data: runs } = await supabase
    .from("sync_runs")
    .select("id, source, sheets, status, total_rows, rows_errored, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  const configured = Boolean(
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID &&
      (process.env.GOOGLE_SHEETS_API_KEY ||
        (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
          process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY))
  );

  return (
    <SyncPreviewClient
      configured={configured}
      defaultSheetName={process.env.GOOGLE_SHEETS_DISTRIBUTION_TAB ?? "Distribution"}
      recentRuns={(runs ?? []).map((run) => ({
        id: run.id,
        source: run.source,
        sheetName: getSheetName(run.sheets, run.metadata),
        status: run.status,
        totalRows: run.total_rows,
        warnings: getIssueCount(run.metadata, "warning"),
        errors: run.rows_errored,
        createdAt: run.created_at,
      }))}
    />
  );
}

function getSheetName(
  sheets: Record<string, unknown> | null,
  metadata: Record<string, unknown> | null
): string {
  const metadataSheet = metadata?.sheet_name;
  if (typeof metadataSheet === "string" && metadataSheet) return metadataSheet;
  const names = sheets?.names;
  return Array.isArray(names) && typeof names[0] === "string" ? names[0] : "—";
}

function getIssueCount(
  metadata: Record<string, unknown> | null,
  severity: "warning" | "error"
): number {
  const counts = metadata?.issue_counts;
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) return 0;
  const value = (counts as Record<string, unknown>)[severity];
  return typeof value === "number" ? value : 0;
}

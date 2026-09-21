"use client";

import { useMemo, useState } from "react";

type RecentRun = {
  id: string;
  source: string;
  sheetName: string;
  status: string;
  totalRows: number;
  warnings: number;
  errors: number;
  createdAt: string;
};

type Issue = {
  row_number: number;
  severity: "warning" | "error";
  issue_type: string;
  message: string;
};

type Outcome = {
  row_number: number;
  outcome: string;
  external_id: string | null;
  collector_name: string | null;
  task: string | null;
  half: string | null;
  sla: string | null;
  issues: Issue[];
};

type PreviewResponse = {
  sync_run_id: string;
  status: "preview";
  source: string;
  sheet_name: string;
  pulled_at: string;
  summary: {
    total_rows: number;
    rows_imported: number;
    rows_updated: number;
    rows_reassigned: number;
    rows_skipped: number;
    rows_errored: number;
    issue_counts: { warning: number; error: number };
    diagnostics: {
      valid_rows: number;
      invalid_rows: number;
      unknown_hr_codes: number;
      admin_hr_codes: number;
      invalid_date_time: number;
      duplicate_logical_keys: number;
      ready_rows: number;
    };
  };
  outcomes: Outcome[];
};

type Props = {
  configured: boolean;
  defaultSheetName: string;
  recentRuns: RecentRun[];
};

const issueFilters = [
  ["all", "All"],
  ["warning", "Warnings"],
  ["error", "Errors"],
  ["validation_error", "Validation"],
  ["task_normalization_warning", "Task normalization"],
  ["duplicate_logical_key_conflict", "Duplicate logical key"],
  ["unknown_hr_code", "Unknown HR code"],
  ["hr_code_belongs_to_admin", "Admin HR code"],
  ["invalid_date_time", "Invalid date/time"],
  ["invalid_url", "Invalid URL"],
  ["other", "Other"],
] as const;

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function friendlyError(status: number): string {
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "Admin access is required to pull a preview.";
  if (status === 422) return "Preview could not be generated. Check the Google Sheets configuration and Distribution data.";
  if (status === 500) return "Unable to save the preview. Please try again.";
  return "Unable to pull Google Sheets data.";
}

export function SyncPreviewClient({ configured, defaultSheetName, recentRuns }: Props) {
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issueFilter, setIssueFilter] = useState<string>("all");

  async function pullPreview() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/sync/run", { method: "POST" });
      if (!response.ok) {
        setError(friendlyError(response.status));
        return;
      }
      const data = (await response.json()) as PreviewResponse;
      setPreview(data);
      setIssueFilter("all");
    } catch {
      setError("Unable to pull Google Sheets data.");
    } finally {
      setLoading(false);
    }
  }

  const issues = useMemo(
    () =>
      (preview?.outcomes ?? []).flatMap((outcome) =>
        outcome.issues.map((issue) => ({
          ...issue,
          external_id: outcome.external_id,
          task: outcome.task,
        }))
      ),
    [preview]
  );
  const filteredIssues = issues.filter(
    (issue) =>
      issueFilter === "all" ||
      issue.severity === issueFilter ||
      issue.issue_type === issueFilter
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl text-chalk-50">Sync Preview</h1>
        <p className="mt-1 text-sm text-chalk-200">
          Pull the operational Distribution data from Google Sheets and review proposed changes.
        </p>
      </div>

      <section className="rounded-card border border-pitch-700 bg-pitch-900 p-5">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs uppercase tracking-wide text-chalk-300">Source</p>
            <h2 className="mt-1 font-display text-xl text-chalk-50">Google Sheets</h2>
            <p className="mt-2 text-sm text-chalk-200">Sheet/Tab: {defaultSheetName}</p>
            <p className="mt-1 text-sm text-chalk-200">
              Status:{" "}
              <span className={configured ? "text-emerald-300" : "text-amber-300"}>
                {configured ? "Configured" : "Not Configured"}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={pullPreview}
            disabled={loading || !configured}
            className="rounded-md bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Pulling from Google Sheets..." : "Pull & Preview"}
          </button>
        </div>
        {!configured && (
          <p className="mt-4 rounded-md border border-amber-700/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
            Google Sheets configuration is missing. Ask an administrator to configure the server integration.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 rounded-md border border-red-700/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
            {error}
          </p>
        )}
      </section>

      {preview && (
        <>
          <section className="rounded-card border border-amber-600/60 bg-amber-950/20 p-5">
            <p className="font-semibold uppercase tracking-wide text-amber-200">
              Preview — No changes have been applied
            </p>
            <p className="mt-2 text-sm text-amber-100">
              Matches and assignments have not been modified.
            </p>
            <p className="mt-3 text-xs text-amber-200/80">
              Run: {preview.sync_run_id} · Status: PREVIEW · Pulled: {formatDate(preview.pulled_at)}
            </p>
          </section>

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {[
              ["Total rows", preview.summary.total_rows],
              ["Would Create", preview.summary.rows_imported],
              ["Would Update", preview.summary.rows_updated],
              ["Would Reassign", preview.summary.rows_reassigned],
              ["Warnings", preview.summary.issue_counts.warning],
              ["Errors", preview.summary.issue_counts.error],
              ["Skipped", preview.summary.rows_skipped],
              ["Valid rows", preview.summary.diagnostics.valid_rows],
              ["Invalid rows", preview.summary.diagnostics.invalid_rows],
              ["Ready to apply", preview.summary.diagnostics.ready_rows],
              ["Unknown HR codes", preview.summary.diagnostics.unknown_hr_codes],
              ["Admin HR codes", preview.summary.diagnostics.admin_hr_codes],
              ["Invalid dates/times", preview.summary.diagnostics.invalid_date_time],
              ["Duplicate keys", preview.summary.diagnostics.duplicate_logical_keys],
            ].map(([label, value]) => (
              <div key={label} className="rounded-card border border-pitch-700 bg-pitch-900 px-4 py-4">
                <p className="text-2xl font-display text-chalk-50">{value}</p>
                <p className="mt-1 text-xs uppercase tracking-wide text-chalk-300">{label}</p>
              </div>
            ))}
          </section>

          <section className="rounded-card border border-pitch-700 bg-pitch-900 p-5">
            <h2 className="font-display text-lg text-chalk-50">Preview Outcomes</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b border-pitch-700 text-xs uppercase tracking-wide text-chalk-300">
                  <tr>
                    {["Row", "Match", "Task", "Half", "Collector", "SLA", "Outcome", "Issues"].map((label) => (
                      <th key={label} className="px-3 py-3">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.outcomes.map((outcome) => (
                    <tr key={outcome.row_number} className="border-b border-pitch-800 text-chalk-100">
                      <td className="px-3 py-3">{outcome.row_number}</td>
                      <td className="px-3 py-3">{outcome.external_id ?? "—"}</td>
                      <td className="px-3 py-3">{outcome.task ?? "—"}</td>
                      <td className="px-3 py-3">{outcome.half ?? "—"}</td>
                      <td className="px-3 py-3">{outcome.collector_name ?? "—"}</td>
                      <td className="px-3 py-3">{outcome.sla ?? "—"}</td>
                      <td className="px-3 py-3 font-medium text-amber-200">{outcome.outcome}</td>
                      <td className="px-3 py-3">{outcome.issues.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-card border border-pitch-700 bg-pitch-900 p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="font-display text-lg text-chalk-50">Issues</h2>
                <p className="mt-1 text-sm text-chalk-300">Inspect validation and normalization issues from this preview.</p>
              </div>
              <select
                value={issueFilter}
                onChange={(event) => setIssueFilter(event.target.value)}
                className="rounded-md border border-pitch-600 bg-pitch-950 px-3 py-2 text-sm text-chalk-100"
                aria-label="Issue filter"
              >
                {issueFilters.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="border-b border-pitch-700 text-xs uppercase tracking-wide text-chalk-300">
                  <tr>
                    {["Row", "Severity", "Issue type", "Message", "Affected row"].map((label) => (
                      <th key={label} className="px-3 py-3">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredIssues.map((issue, index) => (
                    <tr key={`${issue.row_number}-${issue.issue_type}-${index}`} className="border-b border-pitch-800 text-chalk-100">
                      <td className="px-3 py-3">{issue.row_number}</td>
                      <td className="px-3 py-3">{issue.severity}</td>
                      <td className="px-3 py-3">{issue.issue_type}</td>
                      <td className="px-3 py-3">{issue.message}</td>
                      <td className="px-3 py-3">{issue.external_id ?? issue.task ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredIssues.length === 0 && <p className="py-8 text-center text-sm text-chalk-300">No issues for this filter.</p>}
            </div>
          </section>
        </>
      )}

      <section className="rounded-card border border-pitch-700 bg-pitch-900 p-5">
        <h2 className="font-display text-lg text-chalk-50">Recent Preview Runs</h2>
        {recentRuns.length === 0 ? (
          <p className="mt-3 text-sm text-chalk-300">No preview runs found.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="border-b border-pitch-700 text-xs uppercase tracking-wide text-chalk-300">
                <tr>
                  {["Date", "Source", "Sheet", "Status", "Rows", "Warnings", "Errors"].map((label) => (
                    <th key={label} className="px-3 py-3">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((run) => (
                  <tr key={run.id} className="border-b border-pitch-800 text-chalk-100">
                    <td className="px-3 py-3">{formatDate(run.createdAt)}</td>
                    <td className="px-3 py-3">{run.source}</td>
                    <td className="px-3 py-3">{run.sheetName}</td>
                    <td className="px-3 py-3">{run.status.toUpperCase()}</td>
                    <td className="px-3 py-3">{run.totalRows}</td>
                    <td className="px-3 py-3">{run.warnings}</td>
                    <td className="px-3 py-3">{run.errors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

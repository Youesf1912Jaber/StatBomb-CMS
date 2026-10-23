"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SlaCountdown } from "@/components/SlaCountdown";
import type { AdminOverTargetRecord } from "@/lib/over-target/admin-details";
import type { CollectorOverTargetRecord } from "@/lib/over-target/collector-details";
import type { AssignmentStatus, OverTargetRow, OverTargetSheetSyncStatus } from "@/types/database.types";
import {
  displayOverTargetCount,
  displayOverTargetDone,
  displayOverTargetSyncStatus,
  displayOverTargetText,
  displayOverTargetWeek,
  filterOverTargetRecords,
} from "@/lib/over-target/view";

type OverTargetTableVariant = "admin" | "collector";

interface OverTargetTableProps {
  records: OverTargetRow[] | CollectorOverTargetRecord[] | AdminOverTargetRecord[];
  variant: OverTargetTableVariant;
}

const SYNC_STATUS_OPTIONS: Array<{ value: OverTargetSheetSyncStatus | "all"; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "synced", label: "Synced" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
  { value: "imported", label: "Imported" },
];

type OverTargetMatchDetails = {
  home_team: string | null;
  away_team: string | null;
  sla: string | null;
  assignment_status: AssignmentStatus | null;
  assignment_href: string | null;
  match_href: string | null;
  add_collector_href: string | null;
};

function canDeleteOverTargetSheetRow(row: OverTargetRow | CollectorOverTargetRecord | AdminOverTargetRecord): boolean {
  // App-created records can also have a real, verified Google Sheets row after
  // a successful write. The source field describes where the record originated,
  // not whether the corresponding row currently exists in the sheet.
  return row.source_present &&
    row.sheet_row_number != null &&
    Number.isSafeInteger(row.sheet_row_number) &&
    row.sheet_row_number >= 2 &&
    (row.source === "google_sheet" ||
      (row.source === "app" && row.sheet_sync_status === "synced"));
}

function overTargetMatchDetails(
  row: OverTargetRow | CollectorOverTargetRecord | AdminOverTargetRecord
): OverTargetMatchDetails {
  const enriched = row as CollectorOverTargetRecord & AdminOverTargetRecord;
  return {
    home_team: enriched.home_team ?? null,
    away_team: enriched.away_team ?? null,
    sla: enriched.sla ?? null,
    assignment_status: enriched.assignment_status ?? null,
    assignment_href: enriched.assignment_href ?? null,
    match_href: enriched.match_href ?? null,
    add_collector_href: enriched.add_collector_href ?? null,
  };
}

export function OverTargetTable({ records, variant }: OverTargetTableProps) {
  const [query, setQuery] = useState("");
  const [syncStatus, setSyncStatus] = useState<OverTargetSheetSyncStatus | "all">("all");
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const isAdmin = variant === "admin";

  const filtered = useMemo(
    () => filterOverTargetRecords(records, query, isAdmin ? syncStatus : "all").filter((row) => !deletedIds.has(row.id)),
    [deletedIds, isAdmin, query, records, syncStatus]
  );

  const deleteFromSheet = async (row: OverTargetRow | CollectorOverTargetRecord | AdminOverTargetRecord) => {
    const confirmed = window.confirm(`Delete Match ID ${row.match_external_id} from the Over Target Google Sheet? This removes the entire sheet row.`);
    if (!confirmed) return;
    setDeletingId(row.id);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/admin/over-target/${encodeURIComponent(row.id)}/delete`, { method: "DELETE", cache: "no-store" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to delete the sheet row.");
      setDeletedIds((previous) => new Set(previous).add(row.id));
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Unable to delete the sheet row.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-3">
      {deleteError && <p role="alert" className="rounded-[8px] border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">{deleteError}</p>}
      <div className={`grid gap-3 ${isAdmin ? "sm:grid-cols-2" : ""}`}>
        <label className="block text-sm text-chalk-200">
          Search
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={isAdmin ? "Match ID, HR-Code, collector, team, week" : "Match ID, week, team, count, status"}
            className="mt-1 block w-full rounded-[8px] border border-pitch-700 bg-pitch-900 px-3 py-2 text-sm text-chalk-50 placeholder:text-pitch-500"
          />
        </label>
        {isAdmin && (
          <label className="block text-sm text-chalk-200">
            Sync Status
            <select
              value={syncStatus}
              onChange={(event) => setSyncStatus(event.target.value as OverTargetSheetSyncStatus | "all")}
              className="mt-1 block w-full rounded-[8px] border border-pitch-700 bg-pitch-900 px-3 py-2 text-sm text-chalk-50"
            >
              {SYNC_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="text-sm text-chalk-200">
        Showing {filtered.length} of {records.length} Over Target record{records.length === 1 ? "" : "s"}.
      </p>
      {filtered.length === 0 ? (
        <p className="rounded-card border border-dashed border-pitch-700 px-4 py-6 text-center text-sm text-chalk-200">
          No Over Target records found.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-pitch-700">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-pitch-800 text-xs uppercase tracking-wide text-chalk-200">
              <tr>
                <th className="whitespace-nowrap px-3 py-3 font-medium">{isAdmin ? "ID / Match ID" : "Match ID"}</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Week</th>
                {isAdmin && <th className="whitespace-nowrap px-3 py-3 font-medium">HR-Code</th>}
                {isAdmin && <th className="whitespace-nowrap px-3 py-3 font-medium">Collector</th>}
                {isAdmin && <th className="whitespace-nowrap px-3 py-3 font-medium">Team</th>}
                <th className="whitespace-nowrap px-3 py-3 font-medium">Home Team</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Away Team</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">SLA</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Count</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Done</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Sync Status</th>
                {isAdmin && <th className="whitespace-nowrap px-3 py-3 font-medium">Add Collector</th>}
                {isAdmin && <th className="whitespace-nowrap px-3 py-3 font-medium">Sheet Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-pitch-800">
              {filtered.map((row) => {
                const details = overTargetMatchDetails(row);
                const matchIdHref = isAdmin ? details.match_href : details.assignment_href;
                const matchIdLabel = displayOverTargetText(row.match_external_id);
                return (
                  <tr key={row.id} className="bg-pitch-900 text-chalk-50">
                    <td className="whitespace-nowrap px-3 py-3 font-mono">
                      {matchIdHref ? (
                        <Link href={matchIdHref} className="text-chalk-50 hover:text-clock-amber">
                          {matchIdLabel}
                        </Link>
                      ) : (
                        matchIdLabel
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">{displayOverTargetWeek(row)}</td>
                    {isAdmin && <td className="whitespace-nowrap px-3 py-3 font-mono">{displayOverTargetText(row.hr_code)}</td>}
                    {isAdmin && <td className="whitespace-nowrap px-3 py-3">{displayOverTargetText(row.collector_name)}</td>}
                    {isAdmin && <td className="whitespace-nowrap px-3 py-3">{displayOverTargetText(row.team)}</td>}
                    <td className="whitespace-nowrap px-3 py-3">{displayOverTargetText(details.home_team)}</td>
                    <td className="whitespace-nowrap px-3 py-3">{displayOverTargetText(details.away_team)}</td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {details.sla ? (
                        <SlaCountdown sla={details.sla} status={details.assignment_status ?? "Not Started"} />
                      ) : (
                        displayOverTargetText(null)
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">{displayOverTargetCount(row)}</td>
                    <td className="whitespace-nowrap px-3 py-3">{displayOverTargetDone(row)}</td>
                    <td className="whitespace-nowrap px-3 py-3">{displayOverTargetSyncStatus(row.sheet_sync_status)}</td>
                    {isAdmin && (
                      <td className="whitespace-nowrap px-3 py-3">
                        {details.add_collector_href ? (
                          <Link
                            href={details.add_collector_href}
                            className="inline-flex rounded-[8px] border border-pitch-700 px-2.5 py-1.5 text-xs text-chalk-50 hover:border-clock-amber"
                          >
                            Add Collector
                          </Link>
                        ) : (
                          <span className="inline-flex rounded-[8px] border border-pitch-800 px-2.5 py-1.5 text-xs text-pitch-500">
                            Add Collector
                          </span>
                        )}
                      </td>
                    )}
                    {isAdmin && (
                      <td className="whitespace-nowrap px-3 py-3">
                        {canDeleteOverTargetSheetRow(row) ? (
                          <button
                            type="button"
                            onClick={() => void deleteFromSheet(row)}
                            disabled={deletingId === row.id}
                            className="inline-flex rounded-[8px] border border-red-700/70 px-2.5 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-950/50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {deletingId === row.id ? "Deleting…" : "Delete from Sheet"}
                          </button>
                        ) : (
                          <span className="text-xs text-chalk-200">Not a sheet row</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

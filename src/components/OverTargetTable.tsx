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
};

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
  };
}

export function OverTargetTable({ records, variant }: OverTargetTableProps) {
  const [query, setQuery] = useState("");
  const [syncStatus, setSyncStatus] = useState<OverTargetSheetSyncStatus | "all">("all");
  const isAdmin = variant === "admin";

  const filtered = useMemo(
    () => filterOverTargetRecords(records, query, isAdmin ? syncStatus : "all"),
    [isAdmin, query, records, syncStatus]
  );

  return (
    <div className="space-y-3">
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

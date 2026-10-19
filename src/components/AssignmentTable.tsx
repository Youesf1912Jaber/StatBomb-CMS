"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { displayAssignmentMatchId, displayAssignmentShiftDate } from "@/lib/assignments/dashboard-display";
import { distributionPresenceLabel } from "@/lib/assignments/distribution-presence";
import type { AssignmentWithMatch } from "@/lib/assignments/types";
import { AdminAssignmentActions } from "./AdminAssignmentActions";
import { SlaCountdown } from "./SlaCountdown";
import { createClient } from "@/lib/supabase/client";

interface AssignmentTableProps {
  assignments: AssignmentWithMatch[];
  /** Base path for row links, e.g. "/collector/assignments" or "/admin/assignments". */
  detailsBasePath: string;
  /** Show a "Collector" column (used on the admin dashboard). */
  showCollector?: boolean;
  collectorNames?: Record<string, string>;
  liveRefresh?: boolean;
  showFilters?: boolean;
  realtimeRefresh?: boolean;
  initialStatusFilter?: (typeof STATUS_OPTIONS)[number];
}

const STATUS_OPTIONS = ["All", "Not Started", "In Progress", "Completed", "Overdue"] as const;

export function AssignmentTable({
  assignments,
  detailsBasePath,
  showCollector = false,
  collectorNames = {},
  liveRefresh = false,
  showFilters = true,
  realtimeRefresh = true,
  initialStatusFilter = "All",
}: AssignmentTableProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]>(initialStatusFilter);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    if (!realtimeRefresh && !liveRefresh) return;

    const supabase = createClient();
    const channel = realtimeRefresh
      ? supabase
          .channel("assignments-live-status")
          .on("postgres_changes", { event: "*", schema: "public", table: "assignments" }, () => {
            router.refresh();
          })
          .subscribe()
      : null;

    const interval = liveRefresh ? window.setInterval(() => router.refresh(), 30000) : null;
    return () => {
      if (channel) void supabase.removeChannel(channel);
      if (interval !== null) window.clearInterval(interval);
    };
  }, [liveRefresh, realtimeRefresh, router]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assignments.filter((a) => {
      if (statusFilter !== "All" && a.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [
        a.match.home_team,
        a.match.away_team,
        a.task,
        a.half,
        a.match.competition ?? "",
        displayAssignmentMatchId(a),
        displayAssignmentShiftDate(a),
        showCollector ? (collectorNames[a.collector_id] ?? "") : "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [assignments, query, statusFilter, showCollector, collectorNames]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visiblePage = Math.min(page, pageCount);
  const pageAssignments = useMemo(() => filtered.slice((visiblePage - 1) * pageSize, visiblePage * pageSize), [filtered, visiblePage]);

  useEffect(() => setPage(1), [query, statusFilter]);

  return (
    <div>
      {showFilters && <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search team, task, half…"
          className="w-full rounded-[8px] border border-pitch-700 bg-pitch-950 px-3 py-2 text-sm text-chalk-50 outline-none focus:border-clock-amber sm:max-w-xs"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as (typeof STATUS_OPTIONS)[number])}
          className="rounded-[8px] border border-pitch-700 bg-pitch-950 px-3 py-2 text-sm text-chalk-50 outline-none focus:border-clock-amber"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>}

      {filtered.length === 0 ? (
        <p className="rounded-card border border-dashed border-pitch-700 px-6 py-10 text-center text-sm text-chalk-200">
          No assignments match.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-pitch-700">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-pitch-700 bg-pitch-900 text-chalk-200">
              <tr>
                <th className="px-3 py-2">Match</th>
                <th className="whitespace-nowrap px-3 py-2">Match ID</th>
                <th className="px-3 py-2">Match Date</th>
                <th className="whitespace-nowrap px-3 py-2">Shift Date</th>
                <th className="px-3 py-2">Kick-off</th>
                <th className="px-3 py-2">Task</th>
                <th className="px-3 py-2">Half</th>
                {showCollector && <th className="px-3 py-2">Collector</th>}
                <th className="px-3 py-2">Status</th>
                {showCollector && <th className="px-3 py-2">Distribution</th>}
                <th className="px-3 py-2">SLA</th>
                <th className="px-3 py-2">Started</th>
                <th className="px-3 py-2">Completed</th>
                {showCollector && <th className="px-3 py-2">Admin</th>}
              </tr>
            </thead>
            <tbody>
              {pageAssignments.map((a) => (
                <tr key={a.id} className="border-b border-pitch-800 last:border-0 hover:bg-pitch-900">
                  <td className="px-3 py-2">
                    <Link href={`${detailsBasePath}/${a.id}`} className="text-chalk-50 hover:text-clock-amber">
                      {a.match.home_team} vs {a.match.away_team}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-chalk-200">
                    {displayAssignmentMatchId(a)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-chalk-200">{a.match.match_date}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-chalk-200">
                    {displayAssignmentShiftDate(a)}
                  </td>
                  <td className="px-3 py-2 text-chalk-200">
                    {a.match.kickoff_time ? new Date(a.match.kickoff_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                  </td>
                  <td className="px-3 py-2 text-chalk-200">{a.task}</td>
                  <td className="px-3 py-2 text-chalk-200">{a.half}</td>
                  {showCollector && (
                    <td className="px-3 py-2 text-chalk-200">
                      {collectorNames[a.collector_id] ?? "—"}
                    </td>
                  )}
                  <td className="px-3 py-2 text-chalk-200">{a.status}</td>
                  {showCollector && (
                    <td className="px-3 py-2">
                      {a.distribution_present ? (
                        <span className="text-chalk-200">{distributionPresenceLabel(true)}</span>
                      ) : (
                        <span className="font-medium text-clock-amber">{distributionPresenceLabel(false)}</span>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <SlaCountdown sla={a.sla} status={a.status} />
                  </td>
                  <td className="px-3 py-2 text-chalk-200">{a.started_at ? new Date(a.started_at).toLocaleString() : "—"}</td>
                  <td className="px-3 py-2 text-chalk-200">{a.completed_at ? new Date(a.completed_at).toLocaleString() : "—"}</td>
                  {showCollector && (
                    <td className="px-3 py-2">
                      <AdminAssignmentActions assignmentId={a.id} status={a.status} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {filtered.length > pageSize && (
        <div className="mt-3 flex flex-col gap-2 text-sm text-chalk-200 sm:flex-row sm:items-center sm:justify-between">
          <p>Showing {(visiblePage - 1) * pageSize + 1}–{Math.min(visiblePage * pageSize, filtered.length)} of {filtered.length} assignments</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={visiblePage <= 1} className="rounded-lg border border-pitch-700 px-3 py-2 hover:bg-pitch-800 disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
            <span className="whitespace-nowrap">Page {visiblePage} of {pageCount}</span>
            <button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={visiblePage >= pageCount} className="rounded-lg border border-pitch-700 px-3 py-2 hover:bg-pitch-800 disabled:cursor-not-allowed disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

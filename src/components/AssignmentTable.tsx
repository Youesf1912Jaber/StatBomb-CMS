"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AssignmentWithMatch } from "@/lib/assignments/types";
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
}

const STATUS_OPTIONS = ["All", "Not Started", "In Progress", "Completed"] as const;

export function AssignmentTable({
  assignments,
  detailsBasePath,
  showCollector = false,
  collectorNames = {},
  liveRefresh = false,
}: AssignmentTableProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]>("All");

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("assignments-live-status")
      .on("postgres_changes", { event: "*", schema: "public", table: "assignments" }, () => {
        router.refresh();
      })
      .subscribe();

      const interval = liveRefresh ? window.setInterval(() => router.refresh(), 5000) : null;
      return () => {
        void supabase.removeChannel(channel);
        if (interval !== null) window.clearInterval(interval);
      };
  }, [liveRefresh, router]);

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
        showCollector ? (collectorNames[a.collector_id] ?? "") : "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [assignments, query, statusFilter, showCollector, collectorNames]);

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
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
      </div>

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
                <th className="px-3 py-2">Match Date</th>
                <th className="px-3 py-2">Kick-off</th>
                <th className="px-3 py-2">Task</th>
                <th className="px-3 py-2">Half</th>
                {showCollector && <th className="px-3 py-2">Collector</th>}
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">SLA</th>
                <th className="px-3 py-2">Started</th>
                <th className="px-3 py-2">Completed</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b border-pitch-800 last:border-0 hover:bg-pitch-900">
                  <td className="px-3 py-2">
                    <Link href={`${detailsBasePath}/${a.id}`} className="text-chalk-50 hover:text-clock-amber">
                      {a.match.home_team} vs {a.match.away_team}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-chalk-200">{a.match.match_date}</td>
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
                  <td className="px-3 py-2">
                    <SlaCountdown sla={a.sla} status={a.status} />
                  </td>
                  <td className="px-3 py-2 text-chalk-200">{a.started_at ? new Date(a.started_at).toLocaleString() : "—"}</td>
                  <td className="px-3 py-2 text-chalk-200">{a.completed_at ? new Date(a.completed_at).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

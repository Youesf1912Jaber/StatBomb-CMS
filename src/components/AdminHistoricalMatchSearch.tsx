"use client";

import { useState } from "react";
import { AssignmentTable } from "@/components/AssignmentTable";
import type { AssignmentWithMatch } from "@/lib/assignments/types";

type SearchResponse = {
  assignments?: AssignmentWithMatch[];
  collectorNames?: Record<string, string>;
  error?: string;
};

export function AdminHistoricalMatchSearch() {
  const [matchId, setMatchId] = useState("");
  const [assignments, setAssignments] = useState<AssignmentWithMatch[]>([]);
  const [collectorNames, setCollectorNames] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  async function search() {
    const query = matchId.trim();
    if (query.length < 2) {
      setError("Enter at least 2 characters of the Match ID.");
      setAssignments([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/assignments/archive?matchId=${encodeURIComponent(query)}`, {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json()) as SearchResponse;
      if (!response.ok) throw new Error(payload.error ?? "Search failed.");
      setAssignments(payload.assignments ?? []);
      setCollectorNames(payload.collectorNames ?? {});
      setSearched(true);
    } catch (caught) {
      setAssignments([]);
      setSearched(false);
      setError(caught instanceof Error ? caught.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-pitch-700 bg-pitch-950/70 p-4 sm:p-5">
      <div>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-clock-amber">Historical archive · On demand</p>
        <h2 className="mt-1 font-display text-2xl text-chalk-50">Find an older match</h2>
        <p className="mt-1 text-sm text-chalk-200">Older assignments stay in the database and are loaded only when you search by Match ID.</p>
      </div>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <input
          value={matchId}
          onChange={(event) => setMatchId(event.target.value)}
          placeholder="Enter Match ID…"
          aria-label="Search historical assignments by Match ID"
          className="w-full rounded-lg border border-pitch-700 bg-pitch-900 px-3 py-2.5 text-sm text-chalk-50 outline-none focus:border-clock-amber sm:max-w-md"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg border border-clock-amber/50 bg-clock-amber/10 px-4 py-2.5 text-sm font-semibold text-clock-amber hover:bg-clock-amber/20 disabled:opacity-50"
        >
          {loading ? "Searching…" : "Search archive"}
        </button>
      </form>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      {searched && assignments.length === 0 && (
        <p className="rounded-lg border border-dashed border-pitch-700 px-4 py-6 text-center text-sm text-chalk-200">No historical assignments found for that Match ID.</p>
      )}
      {searched && assignments.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-chalk-200">Found {assignments.length} assignment{assignments.length === 1 ? "" : "s"} (up to 100 results).</p>
          <AssignmentTable
            assignments={assignments}
            detailsBasePath="/admin/assignments"
            showCollector
            collectorNames={collectorNames}
            realtimeRefresh={false}
          />
        </div>
      )}
    </section>
  );
}

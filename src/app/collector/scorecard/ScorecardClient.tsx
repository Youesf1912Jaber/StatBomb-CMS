"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ScorecardTable } from "@/components/ScorecardTable";
import type { ScorecardRow } from "@/lib/scorecard/types";
import {
  SCORECARD_ALL_MONTHS,
  distinctScorecardMonths,
  filterScorecardRowsByMonth,
  resolveScorecardMonthSelection,
} from "@/lib/scorecard/view";

type ScorecardResponse = {
  headers?: string[];
  rows?: ScorecardRow[];
  error?: string;
};

export function CollectorScorecardClient() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ScorecardRow[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(SCORECARD_ALL_MONTHS);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyPayload = useCallback((payload: ScorecardResponse) => {
    const nextHeaders = payload.headers ?? [];
    const nextRows = payload.rows ?? [];
    setHeaders(nextHeaders);
    setRows(nextRows);
    setSelectedMonth((current) => resolveScorecardMonthSelection(current, distinctScorecardMonths(nextRows)));
  }, []);

  const loadScorecard = useCallback(async () => {
    const response = await fetch("/api/collector/scorecard", { cache: "no-store" });
    const payload = (await response.json()) as ScorecardResponse;
    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to read Scorecard.");
    }
    applyPayload(payload);
  }, [applyPayload]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadScorecard()
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "Unable to read Scorecard.");
        setHeaders([]);
        setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadScorecard]);

  async function refreshScorecard() {
    if (loading || refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      await loadScorecard();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to read Scorecard.");
    } finally {
      setRefreshing(false);
    }
  }

  const months = useMemo(() => distinctScorecardMonths(rows), [rows]);
  const filteredRows = useMemo(() => {
    const monthRows = filterScorecardRowsByMonth(rows, selectedMonth);
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return monthRows;
    return monthRows.filter((row) =>
      [row.identity.month, row.identity.hr_code, ...row.cells]
        .some((cell) => String(cell ?? "").toLocaleLowerCase().includes(query))
    );
  }, [rows, selectedMonth, searchQuery]);
  const busy = loading || refreshing;
  const hasLoadedData = headers.length > 0 || rows.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-clock-amber">Collector workspace</p>
          <h1 className="mt-1 font-display text-2xl text-chalk-50">My Scorecard</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-chalk-200">
            Review your Scorecard from Google Sheets. Sheet headers are preserved and all values remain read-only.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshScorecard()}
          disabled={busy}
          className="rounded-card border border-clock-amber bg-clock-amber/10 px-4 py-2 text-sm font-semibold text-clock-amber transition-colors hover:bg-clock-amber/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {refreshing ? "Refreshing…" : "Refresh scorecard"}
        </button>
      </div>

      {loading && <p className="text-sm text-chalk-200">Reading Scorecard…</p>}
      {error && (
        <p role="alert" className="rounded-[8px] border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      {!loading && (!error || hasLoadedData) && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-chalk-200">
              Search records
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search any visible value…"
                disabled={busy}
                className="mt-1 block w-full rounded-[8px] border border-pitch-700 bg-pitch-900 px-3 py-2 text-sm text-chalk-50 placeholder:text-pitch-500"
              />
            </label>
            <label className="block text-sm text-chalk-200">
              Month
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              disabled={busy}
              className="mt-1 block w-full rounded-[8px] border border-pitch-700 bg-pitch-900 px-3 py-2 text-sm text-chalk-50 sm:w-64"
            >
              <option value={SCORECARD_ALL_MONTHS}>All months</option>
              {months.map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-pitch-700 bg-pitch-900 px-4 py-3">
            <p className="text-sm text-chalk-200">
              Showing {filteredRows.length} of {rows.length} Scorecard row{rows.length === 1 ? "" : "s"}.
            </p>
            {(searchQuery || selectedMonth !== SCORECARD_ALL_MONTHS) && (
              <button
                type="button"
                onClick={() => { setSearchQuery(""); setSelectedMonth(SCORECARD_ALL_MONTHS); }}
                className="text-xs font-semibold text-clock-amber underline-offset-4 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
          {rows.length === 0 && (
            <p className="rounded-card border border-dashed border-pitch-700 px-4 py-6 text-center text-sm text-chalk-200">
              No Scorecard rows found.
            </p>
          )}
          {rows.length > 0 && filteredRows.length === 0 && (
            <p className="rounded-card border border-dashed border-pitch-700 px-4 py-6 text-center text-sm text-chalk-200">
              No Scorecard rows found for the selected month.
            </p>
          )}
          {filteredRows.length > 0 && <ScorecardTable headers={headers} rows={filteredRows} />}
        </div>
      )}
    </div>
  );
}

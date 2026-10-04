"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  displayExpectedDate,
  displayExpectedShift,
  sortExpectedWeeksNewestFirst,
  type ExpectedWeekView,
} from "@/lib/expected/view";

type WeeksResponse = {
  weeks?: ExpectedWeekView[];
  error?: string;
};

export function ExpectedClient() {
  const [weeks, setWeeks] = useState<ExpectedWeekView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWeeks = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/expected/weeks", { cache: "no-store" });
      const payload = (await response.json()) as WeeksResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to read Expected weeks.");
      }
      setWeeks(sortExpectedWeeksNewestFirst(payload.weeks ?? []));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to read Expected weeks.");
      if (mode === "initial") setWeeks([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadWeeks("initial");
  }, [loadWeeks]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl text-chalk-50">Expected</h1>
          <p className="mt-1 text-sm text-chalk-200">
            Weekly Expected blocks from Google Sheets. Newest weeks appear first. Values are read-only.
          </p>
        </div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => void loadWeeks("refresh")}
            disabled={loading || refreshing}
            className="rounded-card border border-clock-amber bg-clock-amber/10 px-4 py-2 text-sm font-semibold text-clock-amber transition-colors hover:bg-clock-amber/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh Expected"}
          </button>
        </div>
      </div>

      {loading && <p className="text-sm text-chalk-200">Reading Expected weeks…</p>}
      {error && (
        <p role="alert" className="rounded-[8px] border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}
      {!loading && !error && (
        <p className="text-sm text-chalk-200">Showing {weeks.length} Expected week{weeks.length === 1 ? "" : "s"}.</p>
      )}

      {!loading && !error && weeks.length === 0 && (
        <p className="rounded-card border border-dashed border-pitch-700 px-4 py-6 text-center text-sm text-chalk-200">
          No Expected weeks found.
        </p>
      )}

      <div className="space-y-4">
        {weeks.map((week) => (
          <section key={week.week_id} className="rounded-card border border-pitch-700 bg-pitch-900 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <h2 className="font-display text-lg text-chalk-50">
                  {displayExpectedDate(week.start_date)} – {displayExpectedDate(week.end_date)}
                </h2>
                <dl className="grid gap-x-6 gap-y-2 text-sm text-chalk-200 sm:grid-cols-2">
                  <div>
                    <dt className="font-mono text-[11px] uppercase tracking-wide text-pitch-500">Sunday date</dt>
                    <dd className="text-chalk-50">{displayExpectedDate(week.start_date)}</dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[11px] uppercase tracking-wide text-pitch-500">Saturday date</dt>
                    <dd className="text-chalk-50">{displayExpectedDate(week.end_date)}</dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[11px] uppercase tracking-wide text-pitch-500">Shift</dt>
                    <dd className="text-chalk-50">{displayExpectedShift(week)}</dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[11px] uppercase tracking-wide text-pitch-500">Collector count</dt>
                    <dd className="text-chalk-50">{week.collectors.length}</dd>
                  </div>
                </dl>
              </div>
              <Link
                href={`/admin/expected/${encodeURIComponent(week.week_id)}`}
                className="inline-flex items-center justify-center rounded-card border border-clock-amber bg-clock-amber/10 px-4 py-2 text-sm font-semibold text-clock-amber transition-colors hover:bg-clock-amber/20"
              >
                Open Week
              </Link>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

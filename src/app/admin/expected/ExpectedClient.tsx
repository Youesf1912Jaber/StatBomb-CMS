"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  displayExpectedDate,
  displayExpectedShift,
  sortExpectedWeeksNewestFirst,
  type ExpectedWeekView,
} from "@/lib/expected/view";

type CachedWeek = Pick<
  ExpectedWeekView,
  "week_id" | "start_date" | "end_date" | "shift" | "shift_time" | "header_row"
> & {
  collector_count: number;
};

type WeeksResponse = {
  weeks?: CachedWeek[];
  error?: string;
};

type RefreshResponse = {
  success?: boolean;
  error?: string;
};

function toViewWeek(week: CachedWeek): ExpectedWeekView {
  return {
    week_id: week.week_id,
    start_date: week.start_date,
    end_date: week.end_date,
    shift: week.shift,
    shift_time: week.shift_time,
    header_row: week.header_row,
    start_row: 0,
    end_row: 0,
    collectors: [],
    summary: {
      al_r: null,
      ul: null,
      al_c: null,
      h: null,
      sl: null,
      total_absence: null,
      total_shifts_all_team: null,
      expected_shift_matches: null,
      over_target: null,
      total_shift_expected_before: null,
      expected_matches_before_week: null,
      completed_end_of_week: null,
      actual_shifts_end_of_week: null,
      diff: null,
      extras: [],
    },
  };
}

export function ExpectedClient() {
  const [weeks, setWeeks] = useState<CachedWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWeeks = useCallback(async () => {
    const response = await fetch("/api/admin/expected/weeks", { cache: "no-store" });
    const payload = (await response.json()) as WeeksResponse;
    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to read Expected weeks.");
    }
    const incoming = payload.weeks ?? [];
    const counts = new Map(incoming.map((week) => [week.week_id, week.collector_count]));
    const sorted = sortExpectedWeeksNewestFirst(incoming.map(toViewWeek));
    setWeeks(
      sorted.map((week) => ({
        week_id: week.week_id,
        start_date: week.start_date,
        end_date: week.end_date,
        shift: week.shift,
        shift_time: week.shift_time,
        header_row: week.header_row,
        collector_count: counts.get(week.week_id) ?? 0,
      }))
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadWeeks()
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "Unable to read Expected weeks.");
        setWeeks([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadWeeks]);

  async function refreshWeeks() {
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/expected/refresh", { method: "POST" });
      const payload = (await response.json()) as RefreshResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to refresh Expected.");
      }
      await loadWeeks();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to refresh Expected.");
    } finally {
      setRefreshing(false);
    }
  }

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
            onClick={() => void refreshWeeks()}
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
                    <dd className="text-chalk-50">{week.collector_count}</dd>
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

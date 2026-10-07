"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  filterAnnualSpareBalances,
  type AnnualSpareBalance,
} from "@/lib/annual-spare/balance";
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

type AnnualSpareResponse = {
  rows?: AnnualSpareBalance[];
  error?: string;
};

function displayBalanceNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return String(value);
}

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
  const [balances, setBalances] = useState<AnnualSpareBalance[]>([]);
  const [balanceQuery, setBalanceQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);

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

  const loadBalances = useCallback(async () => {
    const response = await fetch("/api/admin/expected/annual-spare", { cache: "no-store" });
    const payload = (await response.json()) as AnnualSpareResponse;
    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to read Annual Spare balances.");
    }
    setBalances(payload.rows ?? []);
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

  useEffect(() => {
    let cancelled = false;
    setBalancesLoading(true);
    setBalanceError(null);
    void loadBalances()
      .catch((reason: unknown) => {
        if (cancelled) return;
        setBalanceError(reason instanceof Error ? reason.message : "Unable to read Annual Spare balances.");
        setBalances([]);
      })
      .finally(() => {
        if (!cancelled) setBalancesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadBalances]);

  const filteredBalances = useMemo(
    () => filterAnnualSpareBalances(balances, balanceQuery),
    [balances, balanceQuery]
  );

  async function refreshWeeks() {
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/expected/refresh", { method: "POST" });
      const payload = (await response.json()) as RefreshResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to refresh Expected.");
      }
      await Promise.all([loadWeeks(), loadBalances()]);
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

      <section className="rounded-card border border-pitch-700 bg-pitch-900 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-lg text-chalk-50">Annual Spare</h2>
            <p className="mt-1 text-sm text-chalk-200">
              Original balances from Annual Spare minus consumed AL-R and AL-C days.
            </p>
          </div>
          <label className="text-sm text-chalk-200">
            Search
            <input
              value={balanceQuery}
              onChange={(event) => setBalanceQuery(event.target.value)}
              placeholder="HR-Code or name"
              className="mt-1 block w-full rounded-[8px] border border-pitch-700 bg-pitch-800 px-3 py-2 text-sm text-chalk-50 placeholder:text-pitch-500 sm:w-64"
            />
          </label>
        </div>
        {balancesLoading && <p className="mt-4 text-sm text-chalk-200">Reading Annual Spare balances…</p>}
        {balanceError && (
          <p role="alert" className="mt-4 rounded-[8px] border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {balanceError}
          </p>
        )}
        {!balancesLoading && !balanceError && (
          <p className="mt-4 text-sm text-chalk-200">
            Showing {filteredBalances.length} of {balances.length} collector{balances.length === 1 ? "" : "s"}.
          </p>
        )}
        {!balancesLoading && !balanceError && (
          <div className="mt-4 overflow-x-auto rounded-lg border border-pitch-700">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-pitch-800 text-xs uppercase tracking-wide text-chalk-300">
                <tr>
                  {["HR-Code", "Name", "Total Available", "Available AL-R", "Available AL-C", "Used", "Remaining"].map(
                    (header) => (
                      <th key={header} className="whitespace-nowrap px-3 py-3 font-medium">
                        {header}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-pitch-700/80">
                {filteredBalances.map((row) => (
                  <tr key={row.hr_code} className="bg-pitch-900 text-chalk-100">
                    <td className="px-3 py-3 font-mono text-chalk-50">{row.hr_code}</td>
                    <td className="px-3 py-3 text-chalk-50">{row.name ?? "—"}</td>
                    <td className="px-3 py-3 text-chalk-50">{displayBalanceNumber(row.total_available)}</td>
                    <td className="px-3 py-3 text-chalk-50">{displayBalanceNumber(row.remaining_al_r)}</td>
                    <td className="px-3 py-3 text-chalk-50">{displayBalanceNumber(row.remaining_al_c)}</td>
                    <td className="px-3 py-3 text-chalk-50">{displayBalanceNumber(row.used)}</td>
                    <td className="px-3 py-3 text-chalk-50">{displayBalanceNumber(row.remaining)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredBalances.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-chalk-200">No Annual Spare rows match this search.</p>
            )}
          </div>
        )}
      </section>

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

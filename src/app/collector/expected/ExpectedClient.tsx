"use client";

import { useCallback, useEffect, useState } from "react";
import { ExpectedWorkShiftsTable } from "@/components/ExpectedWorkShiftsTable";
import {
  displayExpectedDailyShift,
  displayExpectedDate,
  displayExpectedShift,
  displayExpectedValue,
  sortExpectedWeeksNewestFirst,
  type ExpectedWeekView,
  type ExpectedWeekViewCollector,
} from "@/lib/expected/view";

type WeeksResponse = {
  weeks?: ExpectedWeekView[];
  hr_code?: string | null;
  error?: string;
};

const DAY_HEADERS = [
  ["sunday", "Sunday"],
  ["monday", "Monday"],
  ["tuesday", "Tuesday"],
  ["wednesday", "Wednesday"],
  ["thursday", "Thursday"],
  ["friday", "Friday"],
  ["saturday", "Saturday"],
] as const;

function addDays(iso: string, days: number): string | null {
  const parts = iso.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function weekdayDates(week: ExpectedWeekView): Array<string | null> {
  if (week.start_date) {
    return [0, 1, 2, 3, 4, 5, 6].map((offset) => addDays(week.start_date as string, offset));
  }
  return [null, null, null, null, null, null, week.end_date];
}

function collectorDailyValue(row: ExpectedWeekViewCollector, day: (typeof DAY_HEADERS)[number][0]): string {
  return row[day];
}

export function CollectorExpectedClient() {
  const [weeks, setWeeks] = useState<ExpectedWeekView[]>([]);
  const [hrCode, setHrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWeeks = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/collector/expected/weeks", { cache: "no-store" });
      const payload = (await response.json()) as WeeksResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to read Expected weeks.");
      }
      setHrCode(payload.hr_code ?? null);
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
          <h1 className="font-display text-2xl text-chalk-50">My Expected</h1>
          <p className="mt-1 text-sm text-chalk-200">
            Only Expected rows matching your HR-Code. Newest weeks appear first. Values are read-only.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadWeeks("refresh")}
          disabled={loading || refreshing}
          className="rounded-card border border-clock-amber bg-clock-amber/10 px-4 py-2 text-sm font-semibold text-clock-amber transition-colors hover:bg-clock-amber/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {refreshing ? "Refreshing..." : "Refresh Expected"}
        </button>
      </div>

      {!loading && !hrCode && (
        <p className="rounded-card border border-pitch-700 bg-pitch-900 px-4 py-3 text-sm text-chalk-200">
          No HR-Code is set on this account, so no Expected rows can be matched.
        </p>
      )}

      {loading && <p className="text-sm text-chalk-200">Reading Expected weeks…</p>}
      {error && (
        <p role="alert" className="rounded-[8px] border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}
      {!loading && !error && (
        <p className="text-sm text-chalk-200">
          Your Expected weeks: {weeks.length}
        </p>
      )}

      {!loading && !error && weeks.length === 0 && hrCode && (
        <p className="rounded-card border border-dashed border-pitch-700 px-4 py-6 text-center text-sm text-chalk-200">
          No Expected weeks found for your HR-Code.
        </p>
      )}

      {!loading && !error && weeks.length > 0 && <ExpectedWorkShiftsTable />}

      <div className="space-y-6">
        {weeks.map((week) => {
          const dates = weekdayDates(week);
          const row = week.collectors[0];
          return (
            <section key={week.week_id} className="space-y-4 rounded-card border border-pitch-700 bg-pitch-900 p-5">
              <div>
                <h2 className="font-display text-lg text-chalk-50">
                  {displayExpectedDate(week.start_date)} – {displayExpectedDate(week.end_date)}
                </h2>
                <p className="mt-1 text-sm text-chalk-200">Shift: {displayExpectedShift(week)}</p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-pitch-800 text-xs uppercase tracking-wide text-chalk-200">
                    <tr>
                      {DAY_HEADERS.map(([key, label]) => (
                        <th key={key} className="whitespace-nowrap px-3 py-3 font-medium">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-pitch-800/60 text-xs font-medium text-clock-amber">
                      {DAY_HEADERS.map(([key]) => (
                        <td key={key} className="whitespace-nowrap px-3 py-2">
                          {displayExpectedDailyShift(week, key)}
                        </td>
                      ))}
                    </tr>
                    <tr className="text-chalk-50">
                      {dates.map((date, index) => (
                        <td key={DAY_HEADERS[index]?.[0] ?? index} className="whitespace-nowrap px-3 py-3">
                          {displayExpectedDate(date)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              {row && (
                <>
                  <div className="overflow-x-auto rounded-card border border-pitch-700">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-pitch-800 text-xs uppercase tracking-wide text-chalk-200">
                        <tr>
                          <th className="whitespace-nowrap px-3 py-3 font-medium">HR-Code</th>
                          <th className="whitespace-nowrap px-3 py-3 font-medium">Collector</th>
                          <th className="whitespace-nowrap px-3 py-3 font-medium">Type</th>
                          {DAY_HEADERS.map(([key, label]) => (
                            <th key={key} className="whitespace-nowrap px-3 py-3 font-medium">{label.slice(0, 3)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="text-chalk-50">
                          <td className="whitespace-nowrap px-3 py-3 font-mono">{displayExpectedValue(row.hr_code)}</td>
                          <td className="whitespace-nowrap px-3 py-3">{displayExpectedValue(row.collector)}</td>
                          <td className="whitespace-nowrap px-3 py-3">{displayExpectedValue(row.type)}</td>
                          {DAY_HEADERS.map(([key]) => (
                            <td key={key} className="whitespace-nowrap px-3 py-3">
                              {displayExpectedValue(collectorDailyValue(row, key))}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <dl className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-card border border-pitch-700 px-4 py-3">
                      <dt className="text-xs uppercase tracking-wide text-pitch-500">Count-M1</dt>
                      <dd className="mt-1 text-sm text-chalk-50">{displayExpectedValue(row.count_m1)}</dd>
                    </div>
                    <div className="rounded-card border border-pitch-700 px-4 py-3">
                      <dt className="text-xs uppercase tracking-wide text-pitch-500">Sum-M1</dt>
                      <dd className="mt-1 text-sm text-chalk-50">{displayExpectedValue(row.sum_m1)}</dd>
                    </div>
                    <div className="rounded-card border border-pitch-700 px-4 py-3">
                      <dt className="text-xs uppercase tracking-wide text-pitch-500">Actual-M1</dt>
                      <dd className="mt-1 text-sm text-chalk-50">{displayExpectedValue(row.actual_m1)}</dd>
                    </div>
                  </dl>
                </>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EXPECTED_DAILY_VALUES } from "@/lib/expected/options";
import { ExpectedWorkShiftsTable } from "@/components/ExpectedWorkShiftsTable";
import {
  displayExpectedDailyShift,
  displayExpectedDate,
  displayExpectedShift,
  displayExpectedValue,
  EXPECTED_SUMMARY_LABELS,
  type ExpectedWeekView,
  type ExpectedWeekViewCollector,
} from "@/lib/expected/view";

type WeekResponse = {
  week?: ExpectedWeekView;
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

const DAY_SHORT = [
  ["sunday", "Sun"],
  ["monday", "Mon"],
  ["tuesday", "Tue"],
  ["wednesday", "Wed"],
  ["thursday", "Thu"],
  ["friday", "Fri"],
  ["saturday", "Sat"],
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

function collectorDayValue(collector: ExpectedWeekViewCollector, day: (typeof DAY_SHORT)[number][0]): string {
  return collector[day];
}

export function ExpectedWeekClient({ weekId }: { weekId: string }) {
  const [week, setWeek] = useState<ExpectedWeekView | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const loadWeek = useCallback(async () => {
    const response = await fetch(`/api/admin/expected/weeks/${encodeURIComponent(weekId)}`, { cache: "no-store" });
    const payload = (await response.json()) as WeekResponse;
    if (!response.ok || !payload.week) {
      throw new Error(payload.error ?? "Unable to read the Expected week.");
    }
    setWeek(payload.week);
  }, [weekId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadWeek()
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Unable to read the Expected week.");
          setWeek(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadWeek]);

  async function saveDailyValue(collector: ExpectedWeekViewCollector, day: (typeof DAY_SHORT)[number][0], value: string) {
    const current = collectorDayValue(collector, day);
    if (value === current || savingKey) return;
    const key = `${collector.row_number}-${day}`;
    setSavingKey(key);
    setError(null);
    setSaveMessage(null);
    try {
      const response = await fetch(`/api/admin/expected/weeks/${encodeURIComponent(weekId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          hr_code: collector.hr_code,
          day,
          value,
          row_number: collector.row_number,
        }),
      });
      const payload = (await response.json()) as WeekResponse;
      if (!response.ok || !payload.week) {
        throw new Error(payload.error ?? "Unable to save the Expected value.");
      }
      setWeek(payload.week);
      setSaveMessage("Saved. Weekly summary refreshed from Google Sheets.");
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to save the Expected value.");
    } finally {
      setSavingKey(null);
    }
  }

  const dates = week ? weekdayDates(week) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/admin/expected" className="text-sm text-chalk-200 underline-offset-2 hover:underline">
            Back to Expected
          </Link>
          <h1 className="mt-2 font-display text-2xl text-chalk-50">Expected Week</h1>
          {week && (
            <p className="mt-1 text-sm text-chalk-200">
              {displayExpectedDate(week.start_date)} – {displayExpectedDate(week.end_date)}
            </p>
          )}
        </div>
      </div>

      {loading && <p className="text-sm text-chalk-200">Reading Expected week…</p>}
      {saveMessage && <p className="text-sm text-chalk-200">{saveMessage}</p>}
      {error && (
        <p role="alert" className="rounded-[8px] border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      {week && (
        <>
          <ExpectedWorkShiftsTable />

          <section className="rounded-card border border-pitch-700 bg-pitch-900 p-5">
            <p className="font-mono text-[11px] uppercase tracking-wide text-pitch-500">Shift</p>
            <p className="mt-1 font-display text-lg text-chalk-50">{displayExpectedShift(week)}</p>
            <div className="mt-5 overflow-x-auto">
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
                  <tr className="bg-pitch-900 text-chalk-50">
                    {dates.map((date, index) => (
                      <td key={DAY_HEADERS[index]?.[0] ?? index} className="whitespace-nowrap px-3 py-3">
                        {displayExpectedDate(date)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-lg text-chalk-50">Collectors</h2>
            {week.collectors.length === 0 ? (
              <p className="rounded-card border border-dashed border-pitch-700 px-4 py-6 text-center text-sm text-chalk-200">
                No collectors in this week.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-card border border-pitch-700">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-pitch-800 text-xs uppercase tracking-wide text-chalk-200">
                    <tr>
                      <th className="whitespace-nowrap px-3 py-3 font-medium">HR-Code</th>
                      <th className="whitespace-nowrap px-3 py-3 font-medium">Collector</th>
                      <th className="whitespace-nowrap px-3 py-3 font-medium">Type</th>
                      {DAY_SHORT.map(([key, label]) => (
                        <th key={key} className="whitespace-nowrap px-3 py-3 font-medium">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pitch-800">
                    {week.collectors.map((collector) => (
                      <tr key={collector.row_number} className="bg-pitch-900 text-chalk-50">
                        <td className="whitespace-nowrap px-3 py-3 font-mono">{displayExpectedValue(collector.hr_code)}</td>
                        <td className="whitespace-nowrap px-3 py-3">{displayExpectedValue(collector.collector)}</td>
                        <td className="whitespace-nowrap px-3 py-3">{displayExpectedValue(collector.type)}</td>
                        {DAY_SHORT.map(([day]) => {
                          const current = collectorDayValue(collector, day);
                          const key = `${collector.row_number}-${day}`;
                          const known = (EXPECTED_DAILY_VALUES as readonly string[]).includes(current);
                          return (
                            <td key={day} className="whitespace-nowrap px-3 py-3">
                              <select
                                value={known ? current : current}
                                disabled={savingKey !== null}
                                onChange={(event) => void saveDailyValue(collector, day, event.target.value)}
                                className="rounded-[8px] border border-pitch-700 bg-pitch-800 px-2 py-1 text-sm text-chalk-50 disabled:cursor-not-allowed disabled:opacity-60"
                                aria-label={`${collector.hr_code} ${day}`}
                              >
                                {!known && current && <option value={current}>{current}</option>}
                                {!current && <option value="">Select</option>}
                                {EXPECTED_DAILY_VALUES.map((option) => (
                                  <option key={option} value={option}>{option}</option>
                                ))}
                              </select>
                              {savingKey === key && <span className="ml-2 text-xs text-chalk-200">Saving…</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-lg text-chalk-50">Weekly summary</h2>
            <p className="text-sm text-chalk-200">Values belong only to this week and are shown as returned by the sheet.</p>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {EXPECTED_SUMMARY_LABELS.map(([key, label]) => (
                <div key={key} className="rounded-card border border-pitch-700 bg-pitch-900 px-4 py-3">
                  <dt className="text-xs uppercase tracking-wide text-pitch-500">{label}</dt>
                  <dd className="mt-1 text-sm text-chalk-50">{displayExpectedValue(week.summary[key]?.value)}</dd>
                </div>
              ))}
              {week.summary.extras.map((entry) => (
                <div key={`${entry.key}-${entry.label.row}-${entry.label.column}`} className="rounded-card border border-pitch-700 bg-pitch-900 px-4 py-3">
                  <dt className="text-xs uppercase tracking-wide text-pitch-500">{displayExpectedValue(entry.label.value)}</dt>
                  <dd className="mt-1 text-sm text-chalk-50">{displayExpectedValue(entry.value.value)}</dd>
                </div>
              ))}
            </dl>
          </section>
        </>
      )}
    </div>
  );
}

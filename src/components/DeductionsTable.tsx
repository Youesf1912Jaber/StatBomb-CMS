"use client";

import { useMemo, useState } from "react";
import type { DeductionRow } from "@/types/database.types";

interface DeductionsTableProps {
  deductions: DeductionRow[];
  showCollector?: boolean;
}

function display(value: string | null | undefined): string {
  return value && value.trim() ? value : "—";
}

function formatTimestamp(value: string | null, raw: string | null): string {
  if (value) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    }
  }
  return display(raw);
}

function formatDate(value: string | null, raw: string | null): string {
  if (value) {
    const [year, month, day] = value.split("-");
    if (year && month && day) return `${day}/${month}/${year}`;
    return value;
  }
  return display(raw);
}

export function DeductionsTable({ deductions, showCollector = false }: DeductionsTableProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return deductions;
    return deductions.filter((row) => {
      const haystack = [
        row.match_external_id,
        row.collector_name ?? "",
        row.hr_code,
        row.squad ?? "",
        row.side ?? "",
        row.half ?? "",
        row.event ?? "",
        row.comment ?? "",
        row.review_date ?? "",
        row.review_date_raw ?? "",
        row.link ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [deductions, query]);

  return (
    <div className="space-y-3">
      <label className="block text-sm text-chalk-200">
        Search
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={showCollector ? "Match ID, collector, HR-Code, event" : "Match ID, event, comment"}
          className="mt-1 block w-full rounded-[8px] border border-pitch-700 bg-pitch-900 px-3 py-2 text-sm text-chalk-50 placeholder:text-pitch-500 sm:w-80"
        />
      </label>
      <p className="text-sm text-chalk-200">
        Showing {filtered.length} of {deductions.length} deductions.
      </p>
      {filtered.length === 0 ? (
        <p className="rounded-card border border-dashed border-pitch-700 px-4 py-6 text-center text-sm text-chalk-200">
          No deductions found.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-pitch-700">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-pitch-800 text-xs uppercase tracking-wide text-chalk-200">
              <tr>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Match ID</th>
                {showCollector && <th className="whitespace-nowrap px-3 py-3 font-medium">Collector</th>}
                {showCollector && <th className="whitespace-nowrap px-3 py-3 font-medium">HR-Code</th>}
                {showCollector && <th className="whitespace-nowrap px-3 py-3 font-medium">Squad</th>}
                {showCollector && <th className="whitespace-nowrap px-3 py-3 font-medium">Side</th>}
                <th className="whitespace-nowrap px-3 py-3 font-medium">Half</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Timestamp</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Event</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Comment</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Review Date</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Link</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pitch-800">
              {filtered.map((row) => (
                <tr key={row.id} className="bg-pitch-900 text-chalk-50">
                  <td className="whitespace-nowrap px-3 py-3 font-mono">{display(row.match_external_id)}</td>
                  {showCollector && <td className="whitespace-nowrap px-3 py-3">{display(row.collector_name)}</td>}
                  {showCollector && <td className="whitespace-nowrap px-3 py-3 font-mono">{display(row.hr_code)}</td>}
                  {showCollector && <td className="whitespace-nowrap px-3 py-3">{display(row.squad)}</td>}
                  {showCollector && <td className="whitespace-nowrap px-3 py-3">{display(row.side)}</td>}
                  <td className="whitespace-nowrap px-3 py-3">{display(row.half)}</td>
                  <td className="whitespace-nowrap px-3 py-3">{formatTimestamp(row.event_timestamp, row.event_timestamp_raw)}</td>
                  <td className="px-3 py-3">{display(row.event)}</td>
                  <td className="max-w-xs px-3 py-3">{display(row.comment)}</td>
                  <td className="whitespace-nowrap px-3 py-3">{formatDate(row.review_date, row.review_date_raw)}</td>
                  <td className="px-3 py-3">
                    {row.link ? (
                      <a
                        href={row.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-clock-amber hover:underline"
                      >
                        Open
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-chalk-200">
                    {row.source_present ? "Current" : "Historical"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

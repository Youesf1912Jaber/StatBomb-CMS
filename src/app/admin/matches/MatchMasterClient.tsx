"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { normalizeEtaDate } from "@/lib/match-master-date";
import type { MatchMasterRow } from "@/lib/sync/google-sheets";

export function MatchMasterClient() {
  const [matches, setMatches] = useState<MatchMasterRow[]>([]);
  const [query, setQuery] = useState("");
  const [etaDate, setEtaDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/matches/master", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { success?: boolean; matches?: MatchMasterRow[]; error?: string };
        if (!response.ok || !payload.success) throw new Error(payload.error ?? "The Match Master sheet could not be read.");
        setMatches(payload.matches ?? []);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "The Match Master sheet could not be read."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    return matches.filter((match) => {
      const matchesText = !value || [match.match_id, match.home_team, match.away_team]
        .some((field) => field?.toLowerCase().includes(value));
      const matchesEta = !etaDate || normalizeEtaDate(match.eta) === etaDate;
      return matchesText && matchesEta;
    });
  }, [matches, query, etaDate]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl text-chalk-50">Match Master</h1>
          <p className="mt-1 text-sm text-chalk-200">Read-only data from the Matches (T) Google Sheet.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="text-sm text-chalk-200">
            Search
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Match ID or team"
              className="mt-1 block w-full rounded-[8px] border border-pitch-700 bg-pitch-900 px-3 py-2 text-sm text-chalk-50 placeholder:text-pitch-500 sm:w-64"
            />
          </label>
          <label className="text-sm text-chalk-200">
            ETA Date
            <input
              type="date"
              value={etaDate}
              onChange={(event) => setEtaDate(event.target.value)}
              className="mt-1 block rounded-[8px] border border-pitch-700 bg-pitch-900 px-3 py-2 text-sm text-chalk-50"
            />
          </label>
          {etaDate && (
            <button
              type="button"
              onClick={() => setEtaDate("")}
              className="rounded-[8px] border border-pitch-700 px-3 py-2 text-sm text-chalk-50 hover:border-clock-amber"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {loading && <p className="text-sm text-chalk-200">Reading Match Master…</p>}
      {error && <p className="rounded-[8px] border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</p>}
      {!loading && !error && (
        <p className="text-sm text-chalk-200">
          {etaDate
            ? `Showing ${filtered.length} Match Master rows for ETA ${etaDate}.`
            : `Showing ${filtered.length} of ${matches.length} Match Master rows.`}
        </p>
      )}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-card border border-pitch-700">
          <table className="min-w-[1100px] w-full text-left text-sm">
            <thead className="bg-pitch-900 text-xs uppercase tracking-wide text-pitch-500">
              <tr>
                {["Match ID", "Home Team", "Away Team", "Competition", "Season", "Country", "Match Date", "Kick-Off", "Status", "Type", "SLA", "Team"].map((heading) => (
                  <th key={heading} className="px-3 py-3 font-medium">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-pitch-800">
              {filtered.map((match, index) => (
                <tr key={`${match.match_id}-${index}`} className="text-chalk-100">
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-xs">{match.match_id}</td>
                  <td className="px-3 py-3">{match.home_team ?? "—"}</td>
                  <td className="px-3 py-3">{match.away_team ?? "—"}</td>
                  <td className="px-3 py-3">{match.competition_name ?? "—"}</td>
                  <td className="px-3 py-3">{match.season_name ?? "—"}</td>
                  <td className="px-3 py-3">{match.country ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-3">{match.match_date ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-3">{match.kick_off_time ?? "—"}</td>
                  <td className="px-3 py-3">{match.match_status ?? "—"}</td>
                  <td className="px-3 py-3">{match.match_type ?? "—"}</td>
                  <td className="px-3 py-3">{match.sla ?? "—"}</td>
                  <td className="px-3 py-3">{match.team ?? "—"}</td>
                  <td className="px-3 py-3">
                    <Link href={`/admin/matches/${encodeURIComponent(match.match_id)}/distribution`} className="inline-flex rounded-[8px] border border-pitch-700 px-2.5 py-1.5 text-xs text-chalk-50 hover:border-clock-amber">
                      View Distribution
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="px-4 py-10 text-center text-sm text-chalk-200">No Match Master rows match this search.</p>}
        </div>
      )}
    </div>
  );
}

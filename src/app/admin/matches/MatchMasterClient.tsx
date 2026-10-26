"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { normalizeEtaDate } from "@/lib/match-master-date";
import type { MatchMasterRow } from "@/lib/sync/google-sheets";

type MatchMasterDisplayRow = MatchMasterRow & {
  distribution?: { halves: string[]; tasks: string[] } | null;
};
type EtaDay = { date: string; count: number };

function distributionLabel(distribution: MatchMasterDisplayRow["distribution"]): string {
  if (!distribution?.halves.length) return "Not Distributed";
  const halves = distribution.halves.map((half) => half.replace(/^Half\s*/i, "Half")).join(", ");
  return `Distributed ${halves}`;
}

function formatDate(value: string): string {
  const date = normalizeEtaDate(value);
  if (!date) return value;
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function formatSla(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

export function MatchMasterClient() {
  const [days, setDays] = useState<EtaDay[]>([]);
  const [matches, setMatches] = useState<MatchMasterDisplayRow[]>([]);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [etaDate, setEtaDate] = useState("");
  const [activeDay, setActiveDay] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [daysLoading, setDaysLoading] = useState(true);
  const [matchesLoading, setMatchesLoading] = useState(false);

  const loadDays = useCallback(async () => {
    setDaysLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/matches/master?view=days", { cache: "no-store" });
      const payload = await response.json() as { success?: boolean; days?: EtaDay[]; error?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error ?? "ETA days could not be loaded.");
      setDays(payload.days ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ETA days could not be loaded.");
    } finally {
      setDaysLoading(false);
    }
  }, []);

  const loadMatches = useCallback(async (date: string, search: string) => {
    setMatchesLoading(true);
    setError(null);
    setMatches([]);
    try {
      const params = new URLSearchParams({ view: "matches" });
      if (date) params.set("etaDate", date);
      if (search.trim()) params.set("q", search.trim());
      const response = await fetch(`/api/matches/master?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json() as { success?: boolean; matches?: MatchMasterDisplayRow[]; error?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error ?? "Match Master rows could not be loaded.");
      setMatches(payload.matches ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Match Master rows could not be loaded.");
    } finally {
      setMatchesLoading(false);
    }
  }, []);

  useEffect(() => { void loadDays(); }, [loadDays]);

  const openDay = (date: string) => {
    setEtaDate(date);
    setActiveDay(date);
    setSubmittedQuery("");
    setQuery("");
    void loadMatches(date, "");
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const search = query.trim();
    if (!search && !etaDate) return;
    setActiveDay("");
    setSubmittedQuery(search);
    void loadMatches(etaDate, search);
  };

  const clearSelection = () => {
    setEtaDate("");
    setActiveDay("");
    setQuery("");
    setSubmittedQuery("");
    setMatches([]);
    setError(null);
  };

  const selectedDayCount = useMemo(() => days.find((day) => day.date === activeDay)?.count ?? matches.length, [days, activeDay, matches.length]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-2xl text-chalk-50">Match Master</h1>
          <p className="mt-1 text-sm text-chalk-200">Choose an ETA day to load its matches, ordered by the nearest SLA.</p>
        </div>
        <form onSubmit={submitSearch} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="text-sm text-chalk-200">
            Search
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Match ID or team" className="mt-1 block w-full rounded-[8px] border border-pitch-700 bg-pitch-900 px-3 py-2 text-sm text-chalk-50 placeholder:text-pitch-500 sm:w-64" />
          </label>
          <label className="text-sm text-chalk-200">
            ETA Date
            <input type="date" value={etaDate} onChange={(event) => setEtaDate(event.target.value)} className="mt-1 block rounded-[8px] border border-pitch-700 bg-pitch-900 px-3 py-2 text-sm text-chalk-50" />
          </label>
          <button type="submit" disabled={matchesLoading || (!query.trim() && !etaDate)} className="rounded-[8px] border border-clock-amber bg-clock-amber px-4 py-2 text-sm font-bold text-pitch-950 shadow-sm transition hover:bg-clock-amber/90 disabled:cursor-not-allowed disabled:opacity-60">Search</button>
          <button type="button" onClick={clearSelection} className="rounded-[8px] border border-pitch-600 bg-pitch-800 px-3 py-2 text-sm font-medium text-chalk-50 shadow-sm transition hover:border-clock-amber hover:bg-pitch-700">Clear</button>
        </form>
      </div>

      {error && <p className="rounded-[8px] border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</p>}

      {!activeDay && !submittedQuery && !etaDate && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-chalk-50">ETA Days</h2>
            <button type="button" onClick={() => void loadDays()} disabled={daysLoading} className="rounded-[8px] border border-pitch-600 bg-pitch-800 px-3 py-1.5 text-xs font-semibold text-chalk-50 shadow-sm transition hover:border-clock-amber hover:bg-pitch-700 disabled:cursor-not-allowed disabled:opacity-60">{daysLoading ? "Refreshing…" : "Refresh days"}</button>
          </div>
          {daysLoading && <p className="text-sm text-chalk-200">Loading ETA days…</p>}
          {!daysLoading && days.length === 0 && <p className="rounded-[8px] border border-pitch-700 bg-pitch-950/70 px-4 py-8 text-center text-sm text-chalk-200">No ETA dates were found in Match Master.</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {days.map((day) => (
              <button key={day.date} type="button" onClick={() => openDay(day.date)} className="group flex items-center justify-between gap-4 rounded-xl border border-pitch-600 bg-pitch-900 px-5 py-4 text-left transition hover:border-clock-amber hover:bg-pitch-800">
                <span>
                  <span className="block text-lg font-semibold text-chalk-50">ETA {formatDate(day.date)}</span>
                  <span className="mt-1 block text-xs text-chalk-300">Click to view matches</span>
                </span>
                <span className="flex h-10 min-w-10 items-center justify-center rounded-full border border-pitch-600 bg-pitch-950 px-3 text-sm font-bold text-clock-amber">{day.count}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {(activeDay || submittedQuery || etaDate) && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-chalk-50">
                {activeDay ? `ETA ${formatDate(activeDay)}` : etaDate ? `ETA ${formatDate(etaDate)}` : `Search: ${submittedQuery}`}
              </h2>
              {!matchesLoading && <p className="mt-1 text-xs text-chalk-300">{activeDay ? `${selectedDayCount} matches on this ETA day` : `${matches.length} matching results`} · sorted by nearest SLA</p>}
            </div>
            <button type="button" onClick={clearSelection} className="rounded-[8px] border border-pitch-600 bg-pitch-800 px-3 py-2 text-sm font-medium text-chalk-50 shadow-sm transition hover:border-clock-amber hover:bg-pitch-700">Back to ETA days</button>
          </div>

          {matchesLoading && <div className="rounded-xl border border-pitch-700 bg-pitch-950/70 px-4 py-10 text-center text-sm text-chalk-200">Loading matches for this selection…</div>}
          {!matchesLoading && (
            <div className="match-master-table overflow-x-auto rounded-card border border-pitch-700">
              <table className="min-w-[1450px] w-full text-left text-sm">
                <thead className="bg-pitch-900 text-xs uppercase tracking-wide text-pitch-500">
                  <tr>
                    {["Match ID", "Home Team", "Away Team", "Competition", "Season", "Country", "Match Date", "Kick-Off", "Status", "Type", "SLA", "Team", "Distribution", "Distributed Tasks"].map((heading) => <th key={heading} className="px-3 py-3 font-medium">{heading}</th>)}
                    <th className="px-3 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pitch-800">
                  {matches.map((match, index) => {
                    const distributed = Boolean(match.distribution?.halves.length);
                    return (
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
                        <td className="whitespace-nowrap px-3 py-3">{formatSla(match.sla)}</td>
                        <td className="px-3 py-3">{match.team ?? "—"}</td>
                        <td className="min-w-[180px] px-3 py-3">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${distributed ? "border-emerald-700 bg-emerald-950/60 text-emerald-200" : "border-pitch-700 bg-pitch-900 text-chalk-300"}`}>{distributionLabel(match.distribution)}</span>
                        </td>
                        <td className="min-w-[190px] px-3 py-3">
                          {match.distribution?.tasks.length ? <div className="flex flex-wrap gap-1.5">{match.distribution.tasks.map((task) => <span key={task} className="rounded-md border border-pitch-700 bg-pitch-900 px-2 py-1 text-xs text-chalk-100">{task}</span>)}</div> : <span className="text-chalk-400">—</span>}
                        </td>
                        <td className="px-3 py-3"><Link href={`/admin/matches/${encodeURIComponent(match.match_id)}/distribution`} className="inline-flex rounded-[8px] border border-pitch-600 bg-pitch-800 px-2.5 py-1.5 text-xs font-semibold text-chalk-50 shadow-sm transition hover:border-clock-amber hover:bg-pitch-700">View Distribution</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {matches.length === 0 && <p className="px-4 py-10 text-center text-sm text-chalk-200">No Match Master rows match this selection.</p>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";

type PreviewRow = {
  sourceRow: number;
  matchId: string;
  rawMatchId: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  competition: string | null;
  season: string | null;
  matchDate: string | null;
  kickoff: string | null;
  result: string;
  reason: string;
  duplicateRows: number[];
};
type PreviewData = {
  summary: Record<string, number>;
  rows: PreviewRow[];
  fingerprint: string;
  apply: {
    candidates: number;
    blockedDuplicateConflicts: number;
    duplicateExactDeduped: number;
    invalidMetadata: number;
  };
};
const resultFilters = ["All", "New", "Unchanged", "Different", "Duplicate", "Invalid"] as const;

export function MatchMasterPreviewClient() {
  const [data, setData] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(typeof resultFilters)[number]>("All");
  const [matchId, setMatchId] = useState("");
  const [competition, setCompetition] = useState("");
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/matches/sync-preview", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Unable to load preview.");
        setData(payload);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load preview."));
  }, []);

  async function applyMatchMaster() {
    if (!data || !window.confirm(`You are about to create ${data.summary.newMatches ?? 0} Match Master records in Supabase. This does not create assignments and does not modify Google Sheets. Continue?`)) {
      return;
    }
    setApplying(true);
    setApplyResult(null);
    try {
      const response = await fetch("/api/admin/matches/sync-apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fingerprint: data.fingerprint }),
      });
      const payload = await response.json() as {
        error?: string;
        applied?: number;
        blocked?: number;
        failed?: number;
        failedByError?: Record<string, number>;
        failedSample?: Array<{ external_id: string; error: string }>;
      };
      if (!response.ok) throw new Error(payload.error ?? "Unable to apply Match Master records.");
      const errorSummary = payload.failedByError
        ? Object.entries(payload.failedByError).map(([message, count]) => `${count}× ${message}`).join(" | ")
        : "";
      const sample = (payload.failedSample ?? []).slice(0, 5)
        .map((item) => `${item.external_id}: ${item.error}`)
        .join("; ");
      setApplyResult([
        `Applied ${payload.applied ?? 0} records; blocked ${payload.blocked ?? 0} duplicate-conflict rows; failed ${payload.failed ?? 0}.`,
        errorSummary ? `Reasons: ${errorSummary}` : null,
        sample ? `Examples: ${sample}` : null,
      ].filter(Boolean).join(" "));
      const refreshed = await fetch("/api/admin/matches/sync-preview", { cache: "no-store" });
      const refreshedPayload = await refreshed.json();
      if (refreshed.ok) setData(refreshedPayload);
    } catch (reason: unknown) {
      setApplyResult(reason instanceof Error ? reason.message : "Unable to apply Match Master records.");
    } finally {
      setApplying(false);
    }
  }

  const rows = useMemo(() => {
    const filters: Record<string, string> = {
      matchId: matchId.trim().toLowerCase(),
      competition: competition.trim().toLowerCase(),
      homeTeam: homeTeam.trim().toLowerCase(),
      awayTeam: awayTeam.trim().toLowerCase(),
    };
    return (data?.rows ?? []).filter((row) => {
      const resultMatches = result === "All" ||
        (result === "New" && row.result === "NEW_MATCH") ||
        (result === "Unchanged" && row.result === "EXISTING_UNCHANGED") ||
        (result === "Different" && row.result === "EXISTING_DIFFERENT") ||
        (result === "Duplicate" && row.result === "DUPLICATE_MATCH_MASTER") ||
        (result === "Invalid" && row.result === "INVALID_MATCH_ID");
      return resultMatches &&
        (!filters.matchId || row.matchId.toLowerCase().includes(filters.matchId)) &&
        (!filters.competition || (row.competition ?? "").toLowerCase().includes(filters.competition)) &&
        (!filters.homeTeam || (row.homeTeam ?? "").toLowerCase().includes(filters.homeTeam)) &&
        (!filters.awayTeam || (row.awayTeam ?? "").toLowerCase().includes(filters.awayTeam));
    });
  }, [awayTeam, competition, data, homeTeam, matchId, result]);

  if (error) return <p role="alert" className="p-6 text-sm text-clock-red">{error}</p>;
  if (!data) return <p className="p-6 text-sm text-chalk-200">Loading Match Master preview…</p>;

  const summaryLabels: [string, string][] = [
    ["Total source rows", "totalSourceRows"], ["Valid Match IDs", "validMatchIds"],
    ["Unique Match IDs", "uniqueMatchIds"], ["Blank Match IDs", "blankMatchIds"],
    ["Invalid Match IDs", "invalidMatchIds"], ["New Matches", "newMatches"],
    ["Existing Unchanged", "existingUnchanged"], ["Existing Different", "existingDifferent"],
    ["Duplicate Match Master rows", "duplicateMatchMasterRows"],
  ];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-chalk-50">Match Master Sync Preview</h1>
        <p className="mt-1 text-sm font-semibold text-clock-amber">READ-ONLY PREVIEW — No Supabase match data will be changed.</p>
        <p className="mt-1 text-xs text-chalk-300">Applying is a separate, explicit Admin action. It does not create assignments or modify Google Sheets.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summaryLabels.map(([label, key]) => (
          <div key={key} className="rounded-card border border-pitch-700 bg-pitch-900 p-3">
            <p className="text-xs text-chalk-300">{label}</p>
            <p className="mt-1 text-xl font-semibold text-chalk-50">{data.summary[key] ?? 0}</p>
          </div>
        ))}
      </div>
      <div className="rounded-card border border-clock-amber/40 bg-pitch-900 p-4">
        <p className="text-sm text-chalk-200">
          Candidates: <strong>{data.apply.candidates}</strong> · Blocked duplicate conflicts: <strong>{data.apply.blockedDuplicateConflicts}</strong> · Exact duplicate deduped: <strong>{data.apply.duplicateExactDeduped}</strong> · Invalid metadata: <strong>{data.apply.invalidMetadata}</strong>
        </p>
        <button type="button" onClick={applyMatchMaster} disabled={applying || data.apply.candidates === 0} className="mt-3 rounded-[8px] bg-clock-amber px-4 py-2 text-sm font-semibold text-pitch-950 disabled:cursor-not-allowed disabled:opacity-50">
          {applying ? "Applying Match Master…" : "Apply Match Master to Supabase"}
        </button>
        {applyResult && <p role="status" className="mt-2 text-sm text-chalk-200">{applyResult}</p>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <select value={result} onChange={(event) => setResult(event.target.value as (typeof resultFilters)[number])} className="rounded-[8px] border border-pitch-700 bg-pitch-950 px-3 py-2 text-sm text-chalk-50">
          {resultFilters.map((option) => <option key={option}>{option}</option>)}
        </select>
        {[
          ["Match ID", matchId, setMatchId], ["Competition", competition, setCompetition],
          ["Home Team", homeTeam, setHomeTeam], ["Away Team", awayTeam, setAwayTeam],
        ].map(([label, value, setter]) => (
          <input key={label as string} placeholder={label as string} value={value as string} onChange={(event) => (setter as (value: string) => void)(event.target.value)} className="rounded-[8px] border border-pitch-700 bg-pitch-950 px-3 py-2 text-sm text-chalk-50" />
        ))}
      </div>
      <p className="text-sm text-chalk-200">Showing {rows.length} of {data.rows.length} Match Master rows.</p>
      <div className="overflow-x-auto rounded-card border border-pitch-700">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-pitch-700 bg-pitch-900 text-chalk-200">
            <tr>{["Source Row", "Match ID", "Home Team", "Away Team", "Competition", "Season", "Match Date", "Kickoff", "Result", "Reason"].map((header) => <th key={header} className="whitespace-nowrap px-3 py-2">{header}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.sourceRow}-${row.rawMatchId}`} className="border-b border-pitch-800">
                <td className="px-3 py-2">{row.sourceRow}</td><td className="px-3 py-2">{row.matchId || row.rawMatchId || "—"}</td>
                <td className="px-3 py-2">{row.homeTeam || "—"}</td><td className="px-3 py-2">{row.awayTeam || "—"}</td>
                <td className="px-3 py-2">{row.competition || "—"}</td><td className="px-3 py-2">{row.season || "—"}</td>
                <td className="px-3 py-2">{row.matchDate || "—"}</td><td className="px-3 py-2">{row.kickoff || "—"}</td>
                <td className="px-3 py-2 font-semibold">{row.result}</td><td className="px-3 py-2">{row.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

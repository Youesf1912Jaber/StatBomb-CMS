"use client";

import { useEffect, useMemo, useState } from "react";

type PreviewRow = {
  sourceRow: number;
  matchId: string;
  homeTeam: string | null;
  awayTeam: string | null;
  hrCode: string;
  collector: string | null;
  task: string;
  half: string;
  sourceStatus: string | null;
  sla: string | null;
  supabaseStatus: string;
  reason: string;
};
type PreviewData = {
  summary: Record<string, number>;
  rows: PreviewRow[];
};

const resultFilters = ["All", "New", "Existing", "Restored", "Missing", "Invalid", "Duplicate"] as const;

export function DistributionPreviewClient() {
  const [data, setData] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(typeof resultFilters)[number]>("All");
  const [matchId, setMatchId] = useState("");
  const [hrCode, setHrCode] = useState("");
  const [collector, setCollector] = useState("");
  const [half, setHalf] = useState("");
  const [task, setTask] = useState("");

  useEffect(() => {
    fetch("/api/admin/distribution/preview", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Unable to load preview.");
        setData(payload);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load preview."));
  }, []);

  const rows = useMemo(() => {
    const normalizedMatch = matchId.trim().toLowerCase();
    const normalizedHr = hrCode.trim().toLowerCase();
    const normalizedCollector = collector.trim().toLowerCase();
    const normalizedHalf = half.trim().toLowerCase();
    const normalizedTask = task.trim().toLowerCase();
    return (data?.rows ?? []).filter((row) => {
      const resultMatches =
        result === "All" ||
        (result === "New" && row.supabaseStatus === "NEW") ||
        (result === "Existing" && row.supabaseStatus.startsWith("EXISTING_")) ||
        (result === "Restored" && row.supabaseStatus === "RESTORED") ||
        (result === "Missing" && row.supabaseStatus === "MISSING_DISTRIBUTION") ||
        (result === "Invalid" && !["NEW", "EXISTING_UNCHANGED", "EXISTING_DIFFERENT", "RESTORED", "MISSING_DISTRIBUTION", "DUPLICATE_SOURCE"].includes(row.supabaseStatus)) ||
        (result === "Duplicate" && row.supabaseStatus === "DUPLICATE_SOURCE");
      return resultMatches &&
        (!normalizedMatch || row.matchId.toLowerCase().includes(normalizedMatch)) &&
        (!normalizedHr || row.hrCode.toLowerCase().includes(normalizedHr)) &&
        (!normalizedCollector || (row.collector ?? "").toLowerCase().includes(normalizedCollector)) &&
        (!normalizedHalf || row.half.toLowerCase().includes(normalizedHalf)) &&
        (!normalizedTask || row.task.toLowerCase().includes(normalizedTask));
    });
  }, [collector, data, half, hrCode, matchId, result, task]);

  if (error) return <p role="alert" className="p-6 text-sm text-clock-red">{error}</p>;
  if (!data) return <p className="p-6 text-sm text-chalk-200">Loading Distribution preview…</p>;

  const summaryLabels: [string, string][] = [
    ["Total rows scanned", "totalRows"], ["Valid rows", "validRows"], ["Invalid rows", "invalidRows"],
    ["New assignments", "newAssignments"], ["Existing unchanged", "existingUnchanged"],
    ["Existing different", "existingDifferent"], ["Restored assignments", "restoredAssignments"],
    ["Missing Distribution", "missingDistributionAssignments"], ["Duplicate source", "duplicateSource"],
    ["Missing Match IDs", "missingMatchIds"], ["Missing matches", "missingMatches"],
    ["Invalid HR-Codes", "invalidHrCodes"], ["Admin HR-Codes", "adminHrCodes"],
    ["Suspended Collectors", "suspendedCollectors"], ["Deleted Collectors", "deletedCollectors"],
  ];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-chalk-50">Distribution Preview</h1>
        <p className="mt-1 text-sm font-semibold text-clock-amber">READ-ONLY PREVIEW — No Supabase data will be changed.</p>
        <p className="mt-1 text-xs text-chalk-300">Assignments are persisted automatically when Admin adds a Distribution row. This page is monitoring and audit only.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summaryLabels.map(([label, key]) => (
          <div key={key} className="rounded-card border border-pitch-700 bg-pitch-900 p-3">
            <p className="text-xs text-chalk-300">{label}</p>
            <p className="mt-1 text-xl font-semibold text-chalk-50">{data.summary[key] ?? 0}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <select value={result} onChange={(event) => setResult(event.target.value as (typeof resultFilters)[number])} className="rounded-[8px] border border-pitch-700 bg-pitch-950 px-3 py-2 text-sm text-chalk-50">
          {resultFilters.map((option) => <option key={option}>{option}</option>)}
        </select>
        {[
          ["Match ID", matchId, setMatchId], ["HR-Code", hrCode, setHrCode],
          ["Collector", collector, setCollector], ["Half", half, setHalf], ["Task", task, setTask],
        ].map(([label, value, setter]) => (
          <input key={label as string} placeholder={label as string} value={value as string} onChange={(event) => (setter as (value: string) => void)(event.target.value)} className="rounded-[8px] border border-pitch-700 bg-pitch-950 px-3 py-2 text-sm text-chalk-50" />
        ))}
      </div>
      <p className="text-sm text-chalk-200">Showing {rows.length} of {data.rows.length} Distribution rows.</p>
      <div className="overflow-x-auto rounded-card border border-pitch-700">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-pitch-700 bg-pitch-900 text-chalk-200">
            <tr>{["Row", "Match", "Teams", "HR-Code", "Collector", "Task", "Half", "Source Status", "Supabase Status", "Reason"].map((header) => <th key={header} className="whitespace-nowrap px-3 py-2">{header}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.sourceRow}-${row.hrCode}-${row.task}-${row.half}`} className="border-b border-pitch-800">
                <td className="px-3 py-2">{row.sourceRow}</td><td className="px-3 py-2">{row.matchId || "—"}</td>
                <td className="px-3 py-2">{row.homeTeam && row.awayTeam ? `${row.homeTeam} vs ${row.awayTeam}` : "—"}</td>
                <td className="px-3 py-2">{row.hrCode || "—"}</td><td className="px-3 py-2">{row.collector || "—"}</td>
                <td className="px-3 py-2">{row.task || "—"}</td><td className="px-3 py-2">{row.half}</td>
                <td className="px-3 py-2">{row.sourceStatus || "—"}</td><td className="px-3 py-2 font-semibold">{row.supabaseStatus}</td>
                <td className="px-3 py-2">{row.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

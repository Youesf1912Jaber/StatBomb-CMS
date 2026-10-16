"use client";

import { useMemo, useState } from "react";
import type { DeductionRow } from "@/types/database.types";

interface DeductionsTableProps {
  deductions: DeductionRow[];
  showCollector?: boolean;
}

type VisualKind = "yellow" | "red" | "assist" | "substitution" | "tactics" | "other";

interface EventVisual {
  kind: VisualKind;
  symbol: string;
  accent: string;
  title: string;
  description: string;
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

function getEventVisual(event: string | null): EventVisual {
  const value = (event ?? "").toLowerCase();

  if (value.includes("yellow card")) {
    return {
      kind: "yellow",
      symbol: "▰",
      accent: "#facc15",
      title: "Yellow card",
      description: value.includes("missing") ? "Card not recorded" : value.includes("extra") ? "Extra card recorded" : "Card record needs review",
    };
  }
  if (value.includes("red card")) {
    return {
      kind: "red",
      symbol: "▰",
      accent: "#fb4b4b",
      title: "Red card",
      description: value.includes("missing") ? "Card not recorded" : value.includes("extra") ? "Extra card recorded" : "Card record needs review",
    };
  }
  if (value.includes("assist")) {
    return {
      kind: "assist",
      symbol: "↗",
      accent: "#43dfa0",
      title: "Assist",
      description: value.includes("missing") ? "Assist not recorded" : value.includes("extra") ? "Extra assist recorded" : "Assist record needs review",
    };
  }
  if (value.includes("substitution") || value.includes("sub")) {
    return {
      kind: "substitution",
      symbol: "↕",
      accent: "#fb923c",
      title: "Substitution",
      description: value.includes("missing") ? "Substitution not recorded" : value.includes("extra") ? "Extra substitution recorded" : "Player change needs review",
    };
  }
  if (value.includes("tactical") || value.includes("formation") || value.includes("shift")) {
    return {
      kind: "tactics",
      symbol: "⌘",
      accent: "#38bdf8",
      title: value.includes("formation") ? "Formation" : "Tactical board",
      description: value.includes("missing") ? "Tactical detail not recorded" : "Tactical data needs review",
    };
  }
  return {
    kind: "other",
    symbol: "!",
    accent: "#d6b45d",
    title: "Match review",
    description: "This event needs a closer look",
  };
}

function EventArtwork({ visual }: { visual: EventVisual }) {
  return (
    <div
      aria-hidden="true"
      className="relative flex h-full min-h-[112px] w-full shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 sm:min-h-[136px] sm:w-36"
      style={{
        background: `radial-gradient(circle at 72% 18%, ${visual.accent}30, transparent 42%), linear-gradient(145deg, #082d28, #031613 72%)`,
      }}
    >
      <div className="absolute inset-0 opacity-30">
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/20" />
        <div className="absolute left-1/2 top-1/2 aspect-square w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20" />
        <div className="absolute inset-x-3 top-3 bottom-3 rounded border border-white/10" />
      </div>
      {visual.kind === "yellow" || visual.kind === "red" ? (
        <div
          className="relative h-16 w-11 rotate-12 rounded-md shadow-[0_8px_24px_rgba(0,0,0,0.35)] sm:h-[76px] sm:w-[50px]"
          style={{ background: visual.accent, boxShadow: `0 0 28px ${visual.accent}35` }}
        >
          <div className="absolute inset-1 rounded border border-black/10" />
        </div>
      ) : visual.kind === "tactics" ? (
        <div className="relative h-16 w-24 rotate-[-5deg] rounded border-2 border-white/45 bg-[#0b3028] shadow-lg sm:h-[76px] sm:w-28">
          <div className="absolute inset-y-0 left-1/2 border-l border-white/40" />
          <div className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/45" />
          <span className="absolute left-3 top-3 text-xs font-bold" style={{ color: visual.accent }}>×</span>
          <span className="absolute right-4 top-5 text-xs font-bold" style={{ color: visual.accent }}>●</span>
          <span className="absolute bottom-3 left-7 text-xs font-bold" style={{ color: visual.accent }}>↗</span>
          <span className="absolute bottom-3 right-3 text-xs font-bold" style={{ color: visual.accent }}>×</span>
        </div>
      ) : (
        <div
          className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-black/20 text-4xl font-semibold shadow-lg sm:h-[76px] sm:w-[76px]"
          style={{ color: visual.accent }}
        >
          {visual.symbol}
        </div>
      )}
      <span
        className="absolute bottom-2 left-2 rounded-full border border-white/10 bg-black/45 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/80"
      >
        Match incident
      </span>
    </div>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-chalk-400">{label}</p>
      <p className={`mt-1 break-words text-sm text-chalk-100 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
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
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-pitch-700 bg-pitch-900/80 p-4 sm:flex-row sm:items-end sm:justify-between">
        <label className="block w-full text-sm text-chalk-200 sm:max-w-md">
          Search deductions
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={showCollector ? "Match ID, collector, HR-Code, event" : "Match ID, event, comment"}
            className="mt-1 block w-full rounded-xl border border-pitch-700 bg-pitch-950 px-3 py-2.5 text-sm text-chalk-50 outline-none transition focus:border-clock-amber focus:ring-2 focus:ring-clock-amber/20 placeholder:text-pitch-500"
          />
        </label>
        <div className="flex items-center gap-2 text-sm">
          <span className="rounded-full border border-pitch-700 bg-pitch-800 px-3 py-1.5 font-semibold text-chalk-50">
            {filtered.length} shown
          </span>
          <span className="text-chalk-300">of {deductions.length} deductions</span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-pitch-700 px-4 py-10 text-center text-sm text-chalk-200">
          No deductions found. Try another search.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filtered.map((row) => {
            const visual = getEventVisual(row.event);
            const event = row.event ?? "";
            const eventLower = event.toLowerCase();
            const statusLabel = eventLower.includes("missing")
              ? "Missing event"
              : eventLower.includes("extra")
                ? "Extra event"
                : eventLower.includes("wrong")
                  ? "Incorrect event"
                  : "Review required";

            return (
              <article
                key={row.id}
                className="group overflow-hidden rounded-2xl border border-pitch-700 bg-pitch-900/90 shadow-[0_12px_35px_rgba(0,0,0,0.12)] transition duration-200 hover:-translate-y-0.5 hover:border-pitch-500 hover:shadow-[0_16px_40px_rgba(0,0,0,0.22)]"
                style={{ borderTopColor: visual.accent, borderTopWidth: 2 }}
              >
                <div className="flex flex-col gap-3 p-3 sm:flex-row sm:p-4">
                  <EventArtwork visual={visual} />
                  <div className="min-w-0 flex-1 py-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]"
                        style={{ color: visual.accent, borderColor: `${visual.accent}55`, backgroundColor: `${visual.accent}12` }}
                      >
                        {statusLabel}
                      </span>
                      <span className="text-[11px] text-chalk-400">{row.source_present ? "Current source" : "Historical source"}</span>
                    </div>
                    <h2 className="mt-2 text-lg font-semibold leading-snug text-chalk-50">{display(row.event)}</h2>
                    <p className="mt-1 text-xs leading-relaxed text-chalk-300">{visual.description}</p>
                    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                      <Detail label="Match ID" value={display(row.match_external_id)} mono />
                      <Detail label="Half" value={display(row.half)} />
                      <Detail label="Timestamp" value={formatTimestamp(row.event_timestamp, row.event_timestamp_raw)} />
                      <Detail label="Review date" value={formatDate(row.review_date, row.review_date_raw)} />
                    </div>
                  </div>
                </div>

                {row.comment && row.comment.trim() && (
                  <div className="mx-3 mb-3 rounded-xl border border-pitch-700/80 bg-pitch-950/70 px-3 py-2.5 sm:mx-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-chalk-400">Collector comment</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-chalk-100">{row.comment}</p>
                  </div>
                )}

                {(showCollector || row.link) && (
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-pitch-700/80 bg-pitch-950/45 px-4 py-3 text-xs">
                    {showCollector && <span className="text-chalk-300">Collector: <strong className="text-chalk-100">{display(row.collector_name)}</strong></span>}
                    {showCollector && <span className="text-chalk-300">HR-Code: <strong className="font-mono text-chalk-100">{display(row.hr_code)}</strong></span>}
                    {showCollector && <span className="text-chalk-300">Squad: <strong className="text-chalk-100">{display(row.squad)}</strong></span>}
                    {showCollector && <span className="text-chalk-300">Side: <strong className="text-chalk-100">{display(row.side)}</strong></span>}
                    {row.link && (
                      <a href={row.link} target="_blank" rel="noopener noreferrer" className="ml-auto font-semibold text-clock-amber hover:underline">
                        Open source ↗
                      </a>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

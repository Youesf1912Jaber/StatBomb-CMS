"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { DeductionRow } from "@/types/database.types";

interface DeductionsTableProps {
  deductions: DeductionRow[];
  showCollector?: boolean;
}

type EventKind =
  | "wrong-yellow-card"
  | "missing-yellow-card"
  | "wrong-red-card"
  | "missing-red-card"
  | "extra-assist"
  | "missing-assist"
  | "wrong-substitution"
  | "extra-substitution"
  | "missing-substitution"
  | "wrong-tactical-shift"
  | "missing-tactical-shift"
  | "wrong-formation"
  | "other";

interface EventVisual {
  kind: EventKind;
  title: string;
  description: string;
  accent: string;
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
    const kind = value.includes("missing") ? "missing-yellow-card" : "wrong-yellow-card";
    return {
      kind,
      title: "Yellow card",
      description: value.includes("missing") ? "Yellow card not recorded" : value.includes("extra") ? "Extra yellow card recorded" : "Incorrect yellow card recorded",
      accent: "#facc15",
    };
  }
  if (value.includes("red card")) {
    const kind = value.includes("missing") ? "missing-red-card" : "wrong-red-card";
    return {
      kind,
      title: "Red card",
      description: value.includes("missing") ? "Red card not recorded" : value.includes("extra") ? "Extra red card recorded" : "Incorrect red card recorded",
      accent: "#fb4b4b",
    };
  }
  if (value.includes("assist")) {
    return {
      kind: value.includes("missing") ? "missing-assist" : "extra-assist",
      title: "Assist",
      description: value.includes("missing") ? "Assist not recorded" : value.includes("extra") ? "Extra assist recorded" : "Assist record needs review",
      accent: "#43dfa0",
    };
  }
  if (value.includes("substitution") || value.includes("sub")) {
    return {
      kind: value.includes("missing") ? "missing-substitution" : value.includes("extra") ? "extra-substitution" : "wrong-substitution",
      title: "Substitution",
      description: value.includes("missing") ? "Substitution not recorded" : value.includes("extra") ? "Extra substitution recorded" : "Incorrect substitution recorded",
      accent: "#fb923c",
    };
  }
  if (value.includes("tactical") || value.includes("shift")) {
    return {
      kind: value.includes("missing") ? "missing-tactical-shift" : "wrong-tactical-shift",
      title: "Tactical shift",
      description: value.includes("missing") ? "Tactical shift not recorded" : "Incorrect tactical shift recorded",
      accent: "#38bdf8",
    };
  }
  if (value.includes("formation")) {
    return {
      kind: "wrong-formation",
      title: "Formation",
      description: "Incorrect formation recorded",
      accent: "#38bdf8",
    };
  }
  return {
    kind: "other",
    title: "Match review",
    description: "This event needs a closer look",
    accent: "#d6b45d",
  };
}

function statusLabel(event: string): string {
  const value = event.toLowerCase();
  if (value.includes("missing")) return "Missing";
  if (value.includes("extra")) return "Extra";
  if (value.includes("wrong") || value.includes("incorrect")) return "Incorrect";
  return "Review";
}

function EventArtwork({ visual }: { visual: EventVisual }) {
  const imagePath = visual.kind === "other"
    ? null
    : `/images/football/deductions/${visual.kind}.webp`;

  return (
    <div
      aria-hidden="true"
      className="relative h-36 w-full shrink-0 overflow-hidden rounded-xl border border-white/10 bg-pitch-950 sm:h-[156px] sm:w-44 lg:w-48"
      style={{ boxShadow: `inset 0 0 0 1px ${visual.accent}22` }}
    >
      {imagePath ? (
        <Image
          src={imagePath}
          alt=""
          fill
          sizes="(max-width: 640px) 100vw, 192px"
          className="object-cover object-center transition-transform duration-500 group-hover:scale-[1.04]"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_70%_20%,rgba(214,180,93,0.24),transparent_42%),linear-gradient(145deg,#082d28,#031613)]">
          <span className="font-display text-5xl text-clock-amber">!</span>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#021311]/80 via-[#021311]/10 to-transparent" />
      <span
        className="absolute bottom-2 left-2 rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-white shadow-md backdrop-blur-sm"
        style={{ borderColor: `${visual.accent}bb`, backgroundColor: `${visual.accent}25` }}
      >
        {visual.title}
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
      ].join(" ").toLowerCase();
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
          <span className="rounded-full border border-pitch-700 bg-pitch-800 px-3 py-1.5 font-semibold text-chalk-50">{filtered.length} shown</span>
          <span className="text-chalk-300">of {deductions.length} deductions</span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-pitch-700 px-4 py-10 text-center text-sm text-chalk-200">No deductions found. Try another search.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filtered.map((row) => {
            const visual = getEventVisual(row.event);
            const event = row.event ?? "";
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
                        {statusLabel(event)}
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
                    {row.link && <a href={row.link} target="_blank" rel="noopener noreferrer" className="ml-auto font-semibold text-clock-amber hover:underline">Open source ↗</a>}
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

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LinksBoard } from "@/components/LinksBoard";
import type { LinksCell } from "@/lib/links/types";

type LinksResponse = {
  cells?: LinksCell[];
  error?: string;
};

export function LinksClient() {
  const [cells, setCells] = useState<LinksCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const loadLinks = useCallback(async () => {
    const response = await fetch("/api/links", { cache: "no-store" });
    const payload = (await response.json()) as LinksResponse;
    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to read Links.");
    }
    setCells(payload.cells ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadLinks()
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "Unable to read Links.");
        setCells([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadLinks]);

  async function refreshLinks() {
    if (loading || refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      await loadLinks();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to read Links.");
    } finally {
      setRefreshing(false);
    }
  }

  const busy = loading || refreshing;
  const linkedResources = useMemo(() => cells.filter((cell) => Boolean(cell.href)).length, [cells]);

  return (
    <div className="space-y-6">
      <section className="relative isolate overflow-hidden rounded-2xl border border-pitch-700 bg-pitch-950 shadow-[0_18px_55px_rgba(0,0,0,0.16)]">
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(218,186,105,0.13),transparent_38%),linear-gradient(115deg,rgba(5,62,57,0.72),rgba(2,26,25,0.96))]" />
        <div className="flex flex-col gap-6 p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-pitch-600 bg-pitch-900/70 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-chalk-200">
              <span className="h-1.5 w-1.5 rounded-full bg-clock-amber" />
              Arqam Football Operations · Resource Hub
            </span>
            <p className="mt-5 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-clock-amber">Shared references</p>
            <h1 className="mt-1 font-display text-3xl text-chalk-50 sm:text-4xl">Links library<span className="text-clock-amber">.</span></h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-chalk-200">
              Matchday sheets, policies, dashboards, and team resources in one place. Links are synced from Google Sheets and remain read-only here.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:min-w-[300px]">
            <div className="rounded-xl border border-pitch-600 bg-pitch-900/70 p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-chalk-200">Sheet entries</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-chalk-50">{cells.length}</p>
              <p className="mt-1 text-xs text-chalk-200">Visible values</p>
            </div>
            <div className="rounded-xl border border-pitch-600 bg-pitch-900/70 p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-chalk-200">Linked resources</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-clock-amber">{linkedResources}</p>
              <p className="mt-1 text-xs text-chalk-200">Open in new tab</p>
            </div>
          </div>
        </div>
        <div className="h-1 bg-gradient-to-r from-clock-amber via-pitch-500 to-transparent" />
      </section>

      <section className="overflow-hidden rounded-2xl border border-pitch-700 bg-pitch-950/80">
        <div className="flex flex-col gap-4 border-b border-pitch-700 p-4 sm:p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-xl text-chalk-50">Resource directory</h2>
            <p className="mt-1 text-xs text-chalk-200">Search titles, sheet text, or URL addresses.</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
            <label className="relative min-w-0 flex-1 md:w-80">
              <span className="sr-only">Search links</span>
              <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-chalk-200">⌕</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search links…"
                className="w-full rounded-lg border border-pitch-700 bg-pitch-900/80 py-2.5 pl-9 pr-3 text-sm text-chalk-50 placeholder:text-chalk-200/70 focus:border-clock-amber focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => void refreshLinks()}
              disabled={busy}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-pitch-600 bg-pitch-800 px-4 py-2 text-sm font-semibold text-chalk-50 shadow-[inset_0_1px_rgba(255,255,255,0.04)] transition hover:border-clock-amber hover:bg-pitch-700 hover:text-clock-amber disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span aria-hidden="true" className={refreshing ? "animate-spin" : ""}>↻</span>
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        <div className="p-3 sm:p-5">
          {loading && <p role="status" className="rounded-xl border border-pitch-700 bg-pitch-900/60 px-4 py-6 text-center text-sm text-chalk-200">Loading the resource directory…</p>}
          {error && (
            <div role="alert" className="rounded-xl border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-200">
              <p className="font-semibold">Could not load Links</p>
              <p className="mt-1">{error}</p>
            </div>
          )}
          {!loading && !error && cells.length === 0 && (
            <p className="rounded-xl border border-dashed border-pitch-600 px-4 py-10 text-center text-sm text-chalk-200">No links were found in the connected sheet.</p>
          )}
          {!loading && cells.length > 0 && <LinksBoard cells={cells} search={search} />}
        </div>
        <div className="flex flex-col gap-1 border-t border-pitch-700 bg-pitch-900/40 px-4 py-3 text-xs text-chalk-200 sm:flex-row sm:items-center sm:justify-between">
          <span>Google Sheets source · Read-only view</span>
          <span>External links open in a new tab</span>
        </div>
      </section>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
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
  const hasLoadedData = cells.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl text-chalk-50">Links</h1>
          <p className="mt-1 text-sm text-chalk-200">
            Live Links from Google Sheets. Values follow the current sheet cells and are read-only.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshLinks()}
          disabled={busy}
          className="rounded-card border border-clock-amber bg-clock-amber/10 px-4 py-2 text-sm font-semibold text-clock-amber transition-colors hover:bg-clock-amber/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {loading && <p className="text-sm text-chalk-200">Reading Links…</p>}
      {error && (
        <p role="alert" className="rounded-[8px] border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      {!loading && (!error || hasLoadedData) && cells.length === 0 && (
        <p className="rounded-card border border-dashed border-pitch-700 px-4 py-6 text-center text-sm text-chalk-200">
          No links found.
        </p>
      )}

      {!loading && cells.length > 0 && <LinksBoard cells={cells} />}
    </div>
  );
}

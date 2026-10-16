"use client";

import { useCallback, useEffect, useState } from "react";
import { OverTargetTable } from "@/components/OverTargetTable";
import type { CollectorOverTargetRecord } from "@/lib/over-target/collector-details";

type RecordsResponse = {
  records?: CollectorOverTargetRecord[];
  hr_code?: string | null;
  error?: string;
};

export function CollectorOverTargetClient() {
  const [records, setRecords] = useState<CollectorOverTargetRecord[]>([]);
  const [hrCode, setHrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRecords = useCallback(async () => {
    const response = await fetch("/api/collector/over-target", { cache: "no-store" });
    const payload = (await response.json()) as RecordsResponse;
    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to read Over Target.");
    }
    setHrCode(payload.hr_code ?? null);
    setRecords(payload.records ?? []);
  }, []);

  const refreshRecords = useCallback(async () => {
    if (loading || refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      await loadRecords();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to read Over Target.");
    } finally {
      setRefreshing(false);
    }
  }, [loadRecords, loading, refreshing]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadRecords()
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "Unable to read Over Target.");
        setRecords([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadRecords]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-clock-amber">Collector workspace</p>
          <h1 className="mt-1 font-display text-2xl text-chalk-50">My Over Target</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-chalk-200">
            Your Over Target records matched to your account HR-Code. Values are read-only and sourced from Supabase.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshRecords()}
          disabled={loading || refreshing}
          className="inline-flex min-h-10 items-center justify-center rounded-card border border-clock-amber bg-clock-amber/10 px-4 py-2 text-sm font-semibold text-clock-amber transition-colors hover:bg-clock-amber/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {refreshing ? "Refreshing…" : "Refresh records"}
        </button>
      </div>

      {!loading && !hrCode && (
        <p className="rounded-card border border-pitch-700 bg-pitch-900 px-4 py-3 text-sm text-chalk-200">
          No HR-Code is set on this account, so no Over Target records can be matched.
        </p>
      )}

      {loading && <p role="status" className="rounded-card border border-pitch-700 bg-pitch-900 px-4 py-3 text-sm text-chalk-200">Reading Over Target records…</p>}
      {error && (
        <p role="alert" className="rounded-[8px] border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}
      {!loading && !error && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-card border border-pitch-700 bg-pitch-900 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-pitch-500">Matched records</p>
            <p className="mt-2 font-display text-2xl text-chalk-50">{records.length}</p>
            <p className="mt-1 text-xs text-chalk-200">Records available for your account</p>
          </div>
          <div className="rounded-card border border-pitch-700 bg-pitch-900 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-pitch-500">Data source</p>
            <p className="mt-2 font-display text-lg text-chalk-50">Supabase</p>
            <p className="mt-1 text-xs text-chalk-200">Read-only view · HR-Code scoped</p>
          </div>
        </div>
      )}
      {!loading && !error && records.length === 0 && hrCode && (
        <p className="rounded-card border border-dashed border-pitch-700 px-4 py-6 text-center text-sm text-chalk-200">
          No Over Target records found for your HR-Code.
        </p>
      )}
      {!loading && !error && records.length > 0 && <OverTargetTable records={records} variant="collector" />}
    </div>
  );
}

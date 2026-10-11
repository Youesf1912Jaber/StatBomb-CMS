"use client";

import { useCallback, useEffect, useState } from "react";
import { OverTargetTable } from "@/components/OverTargetTable";
import type { AdminOverTargetRecord } from "@/lib/over-target/admin-details";

type RecordsResponse = {
  records?: AdminOverTargetRecord[];
  error?: string;
  sheetRows?: number;
  inserted?: number;
  updated?: number;
  unchanged?: number;
  missing?: number;
};

export function AdminOverTargetClient() {
  const [records, setRecords] = useState<AdminOverTargetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  const loadRecords = useCallback(async () => {
    const response = await fetch("/api/admin/over-target", { cache: "no-store" });
    const payload = (await response.json()) as RecordsResponse;
    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to read Over Target.");
    }
    setRecords(payload.records ?? []);
  }, []);

  const refreshFromSheet = useCallback(async () => {
    setRefreshing(true);
    setRefreshMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/over-target/refresh", {
        method: "POST",
        cache: "no-store",
      });
      const payload = (await response.json()) as RecordsResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to sync the Over Target sheet.");
      }
      await loadRecords();
      setRefreshMessage(
        `Sheet sync complete: ${payload.sheetRows ?? 0} sheet rows, ${payload.inserted ?? 0} added, ${payload.updated ?? 0} updated, ${payload.missing ?? 0} hidden because they are no longer in the sheet.`
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sync the Over Target sheet.");
    } finally {
      setRefreshing(false);
    }
  }, [loadRecords]);

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-chalk-50">Over Target</h1>
          <p className="mt-1 text-sm text-chalk-200">
            Showing records that currently exist in the Google Sheets Over Target tab.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshFromSheet()}
          disabled={refreshing || loading}
          className="rounded-[8px] border border-gold-500 px-4 py-2 text-sm font-semibold text-gold-300 transition hover:bg-gold-500/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {refreshing ? "Syncing Sheet…" : "Sync from Google Sheet"}
        </button>
      </div>
      {refreshMessage && (
        <p role="status" className="rounded-[8px] border border-pitch-700 px-4 py-3 text-sm text-chalk-100">
          {refreshMessage}
        </p>
      )}

      {loading && <p className="text-sm text-chalk-200">Reading Over Target records…</p>}
      {error && (
        <p role="alert" className="rounded-[8px] border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}
      {!loading && !error && <p className="text-sm text-chalk-200">Total Over Target records: {records.length}</p>}
      {!loading && !error && records.length === 0 && (
        <p className="rounded-card border border-dashed border-pitch-700 px-4 py-6 text-center text-sm text-chalk-200">
          No Over Target records found.
        </p>
      )}
      {!loading && !error && records.length > 0 && <OverTargetTable records={records} variant="admin" />}
    </div>
  );
}

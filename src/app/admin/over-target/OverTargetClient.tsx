"use client";

import { useCallback, useEffect, useState } from "react";
import { OverTargetTable } from "@/components/OverTargetTable";
import type { OverTargetRow } from "@/types/database.types";

type RecordsResponse = {
  records?: OverTargetRow[];
  error?: string;
};

export function AdminOverTargetClient() {
  const [records, setRecords] = useState<OverTargetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRecords = useCallback(async () => {
    const response = await fetch("/api/admin/over-target", { cache: "no-store" });
    const payload = (await response.json()) as RecordsResponse;
    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to read Over Target.");
    }
    setRecords(payload.records ?? []);
  }, []);

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
      <div>
        <h1 className="font-display text-2xl text-chalk-50">Over Target</h1>
        <p className="mt-1 text-sm text-chalk-200">
          Cached Over Target records for all collectors. Values are read from Supabase, not Google Sheets.
        </p>
      </div>

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

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
        <h1 className="font-display text-2xl text-chalk-50">My Over Target</h1>
        <p className="mt-1 text-sm text-chalk-200">
          Only Over Target records matching your account HR-Code. Values are read from Supabase, not Google Sheets.
        </p>
      </div>

      {!loading && !hrCode && (
        <p className="rounded-card border border-pitch-700 bg-pitch-900 px-4 py-3 text-sm text-chalk-200">
          No HR-Code is set on this account, so no Over Target records can be matched.
        </p>
      )}

      {loading && <p className="text-sm text-chalk-200">Reading Over Target records…</p>}
      {error && (
        <p role="alert" className="rounded-[8px] border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}
      {!loading && !error && <p className="text-sm text-chalk-200">Your Over Target records: {records.length}</p>}
      {!loading && !error && records.length === 0 && hrCode && (
        <p className="rounded-card border border-dashed border-pitch-700 px-4 py-6 text-center text-sm text-chalk-200">
          No Over Target records found for your HR-Code.
        </p>
      )}
      {!loading && !error && records.length > 0 && <OverTargetTable records={records} variant="collector" />}
    </div>
  );
}

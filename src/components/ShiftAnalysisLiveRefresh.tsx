"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AssignmentRealtimeRow = {
  id?: string;
  collector_id?: string;
  shift_date?: string | null;
  status?: string;
};

type ShiftAnalysisFilters = {
  from?: string;
  to?: string;
  collectorId?: string;
  status?: string;
};

type Props = {
  assignmentIds: string[];
  filters: ShiftAnalysisFilters;
};

function rowMatchesFilters(row: AssignmentRealtimeRow, filters: ShiftAnalysisFilters) {
  if (filters.collectorId && row.collector_id !== filters.collectorId) return false;
  if (filters.status && row.status !== filters.status) return false;
  const date = (row.shift_date ?? "").slice(0, 10);
  if (filters.from && (!date || date < filters.from)) return false;
  if (filters.to && (!date || date > filters.to)) return false;
  return true;
}

/**
 * Refresh only after relevant Realtime changes. Bursts are coalesced so a
 * multi-row operation causes one server refresh rather than one per event.
 * No polling fallback: the explicit Refresh button remains available.
 */
export function ShiftAnalysisLiveRefresh({ assignmentIds, filters }: Props) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ids = useMemo(() => new Set(assignmentIds), [assignmentIds]);
  const filterKey = JSON.stringify(filters);

  const refresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setRefreshing(true);
    router.refresh();
    // This is only button feedback; it does not schedule another data request.
    timerRef.current = setTimeout(() => setRefreshing(false), 700);
  }, [router]);

  useEffect(() => {
    const supabase = createClient();
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => router.refresh(), 600);
    };
    const currentFilters = JSON.parse(filterKey) as ShiftAnalysisFilters;

    const channel = supabase
      .channel("shift-analysis-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "assignments" }, (payload) => {
        const nextRow = payload.new as AssignmentRealtimeRow;
        const previousRow = payload.old as AssignmentRealtimeRow;
        const relevant =
          (!!nextRow.id && ids.has(nextRow.id)) ||
          (!!previousRow.id && ids.has(previousRow.id)) ||
          rowMatchesFilters(nextRow, currentFilters) ||
          rowMatchesFilters(previousRow, currentFilters);
        if (relevant) scheduleRefresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "assignment_task_timers" }, (payload) => {
        const nextRow = payload.new as { assignment_id?: string };
        const previousRow = payload.old as { assignment_id?: string };
        const assignmentId = nextRow.assignment_id ?? previousRow.assignment_id;
        if (assignmentId && ids.has(assignmentId)) scheduleRefresh();
      })
      .subscribe();

    return () => {
      if (debounce) clearTimeout(debounce);
      if (timerRef.current) clearTimeout(timerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [filterKey, ids, router]);

  return (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={refresh}
        disabled={refreshing}
        className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-pitch-600 bg-pitch-900/90 px-3 py-2 text-xs font-semibold text-chalk-100 transition hover:border-clock-amber hover:text-clock-amber disabled:cursor-wait disabled:opacity-60"
        aria-label="Refresh Shift Analysis data"
      >
        <span aria-hidden="true" className={refreshing ? "animate-spin" : ""}>↻</span>
        {refreshing ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}

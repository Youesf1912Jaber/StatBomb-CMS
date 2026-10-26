"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function ShiftDatePicker({ selectedDate }: { selectedDate: string }) {
  const router = useRouter();
  const [date, setDate] = useState(selectedDate);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setDate(selectedDate);
  }, [selectedDate]);

  function showMatches() {
    if (!date) return;
    if (date === selectedDate) return;
    startTransition(() => {
      router.push(`/admin?shiftDate=${encodeURIComponent(date)}`, { scroll: false });
    });
  }

  function showToday() {
    setDate("");
    startTransition(() => {
      router.push("/admin", { scroll: false });
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/15 bg-black/20 px-3 py-2">
      <label htmlFor="shiftDate" className="text-xs text-white/75">Shift date</label>
      <input
        id="shiftDate"
        type="date"
        value={date}
        onChange={(event) => setDate(event.target.value)}
        className="min-w-[132px] rounded-md border border-white/15 bg-[#031c1a] px-2 py-1 text-xs text-white [color-scheme:dark]"
        aria-label="Choose shift date"
      />
      <button
        type="button"
        onClick={showMatches}
        disabled={!date || isPending || date === selectedDate}
        className="rounded-md border border-clock-amber bg-clock-amber px-3 py-1.5 text-xs font-bold text-pitch-950 shadow-sm transition hover:bg-clock-amber/90 disabled:cursor-wait disabled:opacity-60"
      >
        {isPending ? "Loading shift…" : "Show Matches"}
      </button>
      <button
        type="button"
        onClick={showToday}
        disabled={isPending}
        className="rounded-md border border-pitch-600 bg-pitch-800 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-pitch-700 disabled:cursor-wait disabled:opacity-60"
      >
        Today
      </button>
    </div>
  );
}

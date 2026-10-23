"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ShiftDatePicker({ selectedDate }: { selectedDate: string }) {
  const router = useRouter();
  const [date, setDate] = useState(selectedDate);

  function showMatches() {
    if (!date) return;
    router.push(`/admin?shiftDate=${encodeURIComponent(date)}`);
  }

  function showToday() {
    router.push("/admin");
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
        disabled={!date}
        className="rounded-md border border-clock-amber/50 bg-clock-amber/10 px-3 py-1.5 text-xs font-semibold text-clock-amber transition hover:bg-clock-amber/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Show Matches
      </button>
      <button
        type="button"
        onClick={showToday}
        className="px-1 py-1.5 text-xs text-white/65 underline underline-offset-2 hover:text-white"
      >
        Today
      </button>
    </div>
  );
}

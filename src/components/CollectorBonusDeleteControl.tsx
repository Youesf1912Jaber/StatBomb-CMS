"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteOwnBonusSubmission } from "@/lib/bonus/actions";

type BonusDeleteControlProps = {
  bonus: {
    rowNumber: number;
    hrCode: string;
    matchId: string;
    reason: string;
    task: string;
    date: string | null;
  };
};

export function CollectorBonusDeleteControl({ bonus }: BonusDeleteControlProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!window.confirm(`Delete your Bonus submission for Match ID ${bonus.matchId}? This permanently removes the entire row from Google Sheets.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteOwnBonusSubmission(bonus);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        className="rounded-[8px] border border-clock-red/60 bg-clock-red/10 px-3 py-1.5 text-xs font-semibold text-clock-red transition-colors hover:bg-clock-red/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Deleting…" : "Delete"}
      </button>
      {error && <p role="alert" className="max-w-48 whitespace-normal text-xs text-clock-red">{error}</p>}
    </div>
  );
}

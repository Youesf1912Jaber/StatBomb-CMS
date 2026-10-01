"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitBonus } from "@/lib/bonus/actions";
import { BONUS_REASONS, BONUS_TASKS } from "@/lib/bonus/options";

interface BonusSubmissionFormProps {
  assignmentId: string;
}

export function BonusSubmissionForm({ assignmentId }: BonusSubmissionFormProps) {
  const router = useRouter();
  const [reason, setReason] = useState<string>(BONUS_REASONS[0]);
  const [task, setTask] = useState<string>(BONUS_TASKS[0]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await submitBonus(assignmentId, reason, task);
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage("Bonus submitted.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 rounded-card border border-pitch-700 bg-pitch-900 p-5">
      <div>
        <h2 className="font-display text-lg text-chalk-50">Bonus</h2>
        <p className="mt-1 text-sm text-chalk-200">
          Submit a Bonus for this match. Amount and Resolution are managed by Google Sheets and Admin.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-chalk-200">
          Reason
          <select
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1 block w-full rounded-[8px] border border-pitch-700 bg-pitch-900 px-3 py-2 text-sm text-chalk-50"
          >
            {BONUS_REASONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-chalk-200">
          Task
          <select
            value={task}
            onChange={(event) => setTask(event.target.value)}
            className="mt-1 block w-full rounded-[8px] border border-pitch-700 bg-pitch-900 px-3 py-2 text-sm text-chalk-50"
          >
            {BONUS_TASKS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isPending}
        className="rounded-card border border-clock-amber bg-clock-amber/10 px-4 py-2 text-sm font-semibold text-clock-amber transition-colors hover:bg-clock-amber/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Adding…" : "Add Bonus"}
      </button>

      {message && <p className="text-sm text-chalk-200">{message}</p>}
      {error && (
        <p role="alert" className="text-sm text-clock-red">
          {error}
        </p>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { adminCompleteCurrentDistributionAssignments } from "@/lib/assignments/actions";

interface AdminBulkCompleteButtonProps {
  eligibleCount: number;
}

export function AdminBulkCompleteButton({ eligibleCount }: AdminBulkCompleteButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openConfirmation() {
    setError(null);
    setMessage(null);
    setConfirming(true);
  }

  function cancel() {
    if (!isPending) setConfirming(false);
  }

  function completeAll() {
    startTransition(async () => {
      const result = await adminCompleteCurrentDistributionAssignments();
      if (result.error) {
        setError(
          result.errorCode === "ACTIVE_TASK_TIMER"
            ? "Bulk completion was blocked because at least one assignment has an active task timer."
            : result.error
        );
        setConfirming(false);
        return;
      }

      setConfirming(false);
      setMessage(`Successfully marked ${result.completedCount} assignments as Completed.`);
      if (result.warning) setError(result.warning);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={openConfirmation}
        disabled={eligibleCount === 0 || isPending}
        className="rounded-card border border-clock-amber bg-clock-amber/10 px-4 py-2 text-sm font-semibold text-clock-amber transition-colors hover:bg-clock-amber/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Marking All Completed..." : "Mark All Completed"}
      </button>
      {message && <p role="status" className="text-sm text-chalk-200">{message}</p>}
      {error && <p role="alert" className="text-sm text-clock-red">{error}</p>}
      {confirming && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-complete-title"
            className="max-w-md space-y-4 rounded-card border border-pitch-700 bg-pitch-900 p-6 shadow-xl"
          >
            <p id="bulk-complete-title" className="text-sm text-chalk-50">
              Are you sure you want to mark all {eligibleCount} currently distributed assignments as
              Completed?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={cancel}
                disabled={isPending}
                className="rounded-card border border-pitch-700 px-4 py-2 text-sm text-chalk-50 hover:border-clock-amber disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={completeAll}
                disabled={isPending}
                className="rounded-card bg-clock-amber px-4 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "Marking..." : "Mark All Completed"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

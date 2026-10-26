"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startWork, completeWork } from "@/lib/assignments/actions";
import type { AssignmentStatus } from "@/types/database.types";

interface AssignmentWorkControlsProps {
  assignmentId: string;
  status: AssignmentStatus;
  hasActiveTaskTimer?: boolean;
  startedAt?: string | null;
}

export function AssignmentWorkControls({
  assignmentId,
  status,
  hasActiveTaskTimer = false,
  startedAt = null,
}: AssignmentWorkControlsProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  // A restored/reassigned overdue item that has never been started must offer Start Work.
  const canStart = status === "Not Started" || (status === "Overdue" && !startedAt);
  const canComplete = status === "In Progress" || (status === "Overdue" && Boolean(startedAt));

  function handleStart() {
    setError(null);
    startTransition(async () => {
      const result = await startWork(assignmentId);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  function handleComplete() {
    if (hasActiveTaskTimer) {
      setError("Please end all active tasks before completing the assignment.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await completeWork(assignmentId);
      if (result.error) {
        setError(result.error);
      } else {
        if (result.warning) setError(result.warning);
        router.refresh();
      }
    });
  }

  return (
    <div>
      {canStart && (
        <button
          onClick={handleStart}
          disabled={isPending}
          className="rounded-card bg-clock-amber px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-[#e3b45c] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Starting…" : "Start Work"}
        </button>
      )}

      {canComplete && (
        <button
          onClick={handleComplete}
          disabled={isPending || hasActiveTaskTimer}
          className="rounded-card bg-clock-amber px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-[#e3b45c] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Completing…" : "Complete Work"}
        </button>
      )}

      {status === "Completed" && (
        <p className="text-sm text-chalk-200">This assignment is complete.</p>
      )}

      {hasActiveTaskTimer && canComplete && (
        <p className="mt-2 text-sm text-chalk-200">
          End the running task before completing the assignment.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-clock-red">
          {error}
        </p>
      )}
    </div>
  );
}

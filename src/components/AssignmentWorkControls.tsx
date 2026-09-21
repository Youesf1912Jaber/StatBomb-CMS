"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startWork, completeWork } from "@/lib/assignments/actions";
import type { AssignmentStatus } from "@/types/database.types";

interface AssignmentWorkControlsProps {
  assignmentId: string;
  status: AssignmentStatus;
}

export function AssignmentWorkControls({ assignmentId, status }: AssignmentWorkControlsProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

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
    setError(null);
    startTransition(async () => {
      const result = await completeWork(assignmentId);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div>
      {status === "Not Started" && (
        <button
          onClick={handleStart}
          disabled={isPending}
          className="rounded-card bg-clock-amber px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-[#e3b45c] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Starting…" : "Start Work"}
        </button>
      )}

      {(status === "In Progress" || status === "Overdue") && (
        <button
          onClick={handleComplete}
          disabled={isPending}
          className="rounded-card bg-clock-amber px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-[#e3b45c] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Completing…" : "Complete Work"}
        </button>
      )}

      {status === "Completed" && (
        <p className="text-sm text-chalk-200">This assignment is complete.</p>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-clock-red">
          {error}
        </p>
      )}
    </div>
  );
}

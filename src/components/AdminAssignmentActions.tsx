"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminMarkAssignmentComplete, hideAssignmentFromDashboard } from "@/lib/assignments/actions";
import type { AssignmentStatus } from "@/types/database.types";

type PendingAction = "hide" | "complete" | null;

interface AdminAssignmentActionsProps {
  assignmentId: string;
  status: AssignmentStatus;
}

export function AdminAssignmentActions({ assignmentId, status }: AdminAssignmentActionsProps) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirmHide() {
    setError(null);
    setMessage(null);
    setPendingAction("hide");
  }

  function confirmComplete() {
    setError(null);
    setMessage(null);
    setPendingAction("complete");
  }

  function cancel() {
    if (isPending) return;
    setPendingAction(null);
  }

  function runHide() {
    startTransition(async () => {
      const result = await hideAssignmentFromDashboard(assignmentId);
      if (result.error) {
        setError(result.error);
        setPendingAction(null);
        return;
      }
      setPendingAction(null);
      setMessage("Assignment removed from the Dashboard.");
      router.refresh();
    });
  }

  function runComplete() {
    startTransition(async () => {
      const result = await adminMarkAssignmentComplete(assignmentId);
      if (result.error) {
        setError(result.error);
        setPendingAction(null);
        return;
      }
      setPendingAction(null);
      setMessage("Assignment marked as completed.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={confirmHide}
          disabled={isPending}
          className="rounded-card border border-pitch-700 px-3 py-1.5 text-xs font-semibold text-chalk-50 transition-colors hover:border-clock-amber disabled:cursor-not-allowed disabled:opacity-60"
        >
          Remove from Dashboard
        </button>
        {status !== "Completed" && (
          <button
            type="button"
            onClick={confirmComplete}
            disabled={isPending}
            className="rounded-card border border-clock-amber bg-clock-amber/10 px-3 py-1.5 text-xs font-semibold text-clock-amber transition-colors hover:bg-clock-amber/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Mark Complete
          </button>
        )}
      </div>
      {message && <p className="text-xs text-chalk-200">{message}</p>}
      {error && (
        <p role="alert" className="text-xs text-clock-red">
          {error}
        </p>
      )}
      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-w-md space-y-4 rounded-card border border-pitch-700 bg-pitch-900 p-6 shadow-xl">
            <p className="text-sm text-chalk-50">
              {pendingAction === "hide"
                ? "Are you sure you want to remove this assignment from the Dashboard?"
                : "Mark this assignment as completed manually?"}
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
                onClick={pendingAction === "hide" ? runHide : runComplete}
                disabled={isPending}
                className="rounded-card bg-clock-amber px-4 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "Working..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminMarkAssignmentComplete, hideAssignmentFromDashboard } from "@/lib/assignments/actions";
import type { AssignmentStatus } from "@/types/database.types";

type PendingAction = "hide" | "complete" | "remove-sheet" | null;

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

  function runRemoveFromSheet() {
    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/distribution-row", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ assignmentId }),
        });
        const result = await response.json() as { success?: boolean; error?: string; deletedRow?: number };
        if (!response.ok || !result.success) {
          setError(result.error ?? "The Distribution row could not be deleted.");
          setPendingAction(null);
          return;
        }
        setPendingAction(null);
        setMessage(`Removed from Distribution sheet (row ${result.deletedRow}). Assignment history was preserved.`);
        router.refresh();
      } catch {
        setError("The Distribution row could not be deleted. Check your connection and refresh before retrying.");
        setPendingAction(null);
      }
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
      setMessage(result.warning ?? "Assignment marked as completed.");
      router.refresh();
    });
  }

  return (
    <div className="min-w-[104px] space-y-1.5">
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={confirmHide}
          disabled={isPending}
          className="w-full rounded-lg border border-pitch-600 bg-pitch-900/70 px-2.5 py-2 text-[11px] font-semibold leading-tight text-chalk-50 transition-colors hover:border-clock-amber hover:bg-pitch-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Remove from Dashboard
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setMessage(null);
            setPendingAction("remove-sheet");
          }}
          disabled={isPending}
          className="w-full rounded-lg border border-clock-red/50 bg-clock-red/5 px-2.5 py-2 text-[11px] font-semibold leading-tight text-clock-red transition-colors hover:border-clock-red hover:bg-clock-red/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Remove from Sheet
        </button>
        {status !== "Completed" && (
          <button
            type="button"
            onClick={confirmComplete}
            disabled={isPending}
            className="w-full rounded-lg border border-clock-amber/50 bg-clock-amber/10 px-2.5 py-2 text-[11px] font-semibold leading-tight text-clock-amber transition-colors hover:bg-clock-amber/20 disabled:cursor-not-allowed disabled:opacity-60"
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
                ? "Remove this assignment from the Dashboard only? The Google Sheets row will remain unchanged."
                : pendingAction === "remove-sheet"
                  ? "Permanently delete this collector's assignment row from the Distribution Google Sheet? The assignment history in the app will be preserved. This cannot be undone."
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
                onClick={pendingAction === "hide" ? runHide : pendingAction === "remove-sheet" ? runRemoveFromSheet : runComplete}
                disabled={isPending}
                className="rounded-card bg-clock-amber px-4 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "Working..." : pendingAction === "remove-sheet" ? "Delete Sheet Row" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

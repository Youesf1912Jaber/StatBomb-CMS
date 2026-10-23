"use client";

import { useState, useTransition } from "react";
import { reassignAssignment, type ReassignmentMode } from "@/lib/assignments/actions";

interface CollectorOption {
  id: string;
  full_name: string | null;
  email: string;
}

interface ReassignModalProps {
  assignmentId: string;
  currentCollectorId: string;
  currentCollectorName: string;
  availableCollectors: CollectorOption[];
  onClose: () => void;
}

export function ReassignModal({
  assignmentId,
  currentCollectorId,
  currentCollectorName,
  availableCollectors,
  onClose,
}: ReassignModalProps) {
  const [newCollectorId, setNewCollectorId] = useState("");
  const [mode, setMode] = useState<ReassignmentMode>("preserve");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const newCollector = availableCollectors.find((c) => c.id === newCollectorId);
  const newCollectorName = newCollector?.full_name ?? newCollector?.email ?? "Unknown";

  function handleSubmit() {
    if (!newCollectorId) {
      setError("Please select a new collector.");
      return;
    }

    if (newCollectorId === currentCollectorId) {
      setError("Cannot reassign to the same collector.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await reassignAssignment(assignmentId, newCollectorId, mode);
      if (result.error) {
        setError(result.error);
      } else {
        setWarning(result.warning ?? null);
        setSuccess(true);
        setTimeout(() => {
          onClose();
        }, 1500);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-w-md space-y-4 rounded-card border border-pitch-700 bg-pitch-900 p-6 shadow-xl">
        <h2 className="font-display text-xl text-chalk-50">Reassign Assignment</h2>

        {success ? (
          <div className="rounded border border-green-700 bg-green-900/30 p-3 text-sm text-green-300">
            Assignment reassigned successfully.
            {warning && (
              <p role="alert" className="mt-2 text-xs text-clock-amber">{warning}</p>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-chalk-200">Current collector:</p>
                <p className="font-medium text-chalk-50">{currentCollectorName}</p>
              </div>

              <div>
                <label htmlFor="new-collector" className="block text-chalk-200">
                  New collector:
                </label>
                <select
                  id="new-collector"
                  value={newCollectorId}
                  onChange={(e) => setNewCollectorId(e.target.value)}
                  className="mt-1 w-full rounded border border-pitch-700 bg-pitch-800 px-3 py-2 text-chalk-50 focus:border-clock-amber focus:outline-none"
                  disabled={isPending}
                >
                  <option value="">Select a collector...</option>
                  {availableCollectors
                    .filter((c) => c.id !== currentCollectorId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name ?? c.email}
                      </option>
                    ))}
                </select>
              </div>

              <div className="space-y-2">
                <p className="text-chalk-200">Reassignment mode:</p>
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="mode"
                    value="preserve"
                    checked={mode === "preserve"}
                    onChange={() => setMode("preserve")}
                    className="mt-0.5"
                    disabled={isPending}
                  />
                  <span className="text-chalk-50">
                    <strong>Preserve Status</strong> — keep current status and timestamps unchanged
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="mode"
                    value="reset"
                    checked={mode === "reset"}
                    onChange={() => setMode("reset")}
                    className="mt-0.5"
                    disabled={isPending}
                  />
                  <span className="text-chalk-50">
                    <strong>Reset to Not Started</strong> — clear status, started_at, and completed_at
                  </span>
                </label>
              </div>

              <div className="rounded border border-clock-amber/30 bg-clock-amber/10 p-3 text-xs text-clock-amber">
                <p className="font-semibold">Note:</p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  <li>SLA remains unchanged in both modes</li>
                  {mode === "reset" && (
                    <li>Progress timestamps (started_at, completed_at) will be cleared</li>
                  )}
                </ul>
              </div>
            </div>

            {error && (
              <div className="rounded border border-red-700 bg-red-900/30 p-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded border border-pitch-700 px-4 py-2 text-sm text-chalk-200 transition-colors hover:border-chalk-200 hover:text-chalk-50 disabled:opacity-50"
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className="flex-1 rounded bg-clock-amber px-4 py-2 text-sm font-semibold text-pitch-900 transition-colors hover:bg-clock-amber/80 disabled:opacity-50"
                disabled={isPending || !newCollectorId}
              >
                {isPending ? "Reassigning..." : "Reassign"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { updateAssignment } from "@/lib/assignments/actions";
import type { AssignmentRow } from "@/types/database.types";

interface EditAssignmentModalProps {
  assignment: AssignmentRow;
  onClose: () => void;
  onSuccess: () => void;
}

const HALF_OPTIONS = ["Half 1", "Half 2", "Half 3", "Half 4", "Full Match"] as const;

/**
 * Validates URL schemes — allows http(s)://, rejects javascript: and other unsafe schemes.
 */
function isValidUrl(url: string | null): boolean {
  if (!url || url.trim() === "") return true; // Empty is OK
  try {
    const parsed = new URL(url);
    // Only allow http and https
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function EditAssignmentModal({
  assignment,
  onClose,
  onSuccess,
}: EditAssignmentModalProps) {
  const [task, setTask] = useState(assignment.task);
  const [half, setHalf] = useState(assignment.half);
  const [sla, setSla] = useState(assignment.sla);
  const [notes, setNotes] = useState(assignment.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const slaDate = new Date(sla).toISOString().split("T")[0];
  const slaTime = new Date(sla).toISOString().split("T")[1]?.slice(0, 5) || "00:00";

  function handleSubmit() {
    // Validate task
    if (!task || task.trim() === "") {
      setError("Task is required.");
      return;
    }

    // Validate half
    if (!HALF_OPTIONS.includes(half as any)) {
      setError("Invalid half selected.");
      return;
    }

    // Validate SLA date/time
    if (!slaDate || !slaTime) {
      setError("SLA date and time are required.");
      return;
    }

    // Notes validation (optional, but trim if provided)
    const trimmedNotes = notes.trim();

    setError(null);
    startTransition(async () => {
      // Reconstruct full SLA ISO string
      const slaIso = `${slaDate}T${slaTime}:00Z`;

      const result = await updateAssignment(
        assignment.id,
        task,
        half,
        slaIso,
        trimmedNotes || null
      );

      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1500);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-w-2xl w-full space-y-4 rounded-card border border-pitch-700 bg-pitch-900 p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <h2 className="font-display text-xl text-chalk-50">Edit Assignment</h2>

        {success ? (
          <div className="rounded border border-green-700 bg-green-900/30 p-3 text-sm text-green-300">
            Assignment updated successfully.
          </div>
        ) : (
          <>
            <div className="space-y-4 text-sm">
              <div>
                <label htmlFor="task" className="block text-chalk-200">
                  Task
                </label>
                <input
                  id="task"
                  type="text"
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  className="mt-1 w-full rounded border border-pitch-700 bg-pitch-800 px-3 py-2 text-chalk-50 focus:border-clock-amber focus:outline-none disabled:opacity-50"
                  disabled={isPending}
                  placeholder="e.g. 1st Half - Shot Map"
                />
              </div>

              <div>
                <label htmlFor="half" className="block text-chalk-200">
                  Half
                </label>
                <select
                  id="half"
                  value={half}
                  onChange={(e) => setHalf(e.target.value as typeof half)}
                  className="mt-1 w-full rounded border border-pitch-700 bg-pitch-800 px-3 py-2 text-chalk-50 focus:border-clock-amber focus:outline-none disabled:opacity-50"
                  disabled={isPending}
                >
                  {HALF_OPTIONS.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="sla-date" className="block text-chalk-200">
                    SLA Date
                  </label>
                  <input
                    id="sla-date"
                    type="date"
                    value={slaDate}
                    onChange={(e) => setSla(new Date(`${e.target.value}T${slaTime}:00Z`).toISOString())}
                    className="mt-1 w-full rounded border border-pitch-700 bg-pitch-800 px-3 py-2 text-chalk-50 focus:border-clock-amber focus:outline-none disabled:opacity-50"
                    disabled={isPending}
                  />
                </div>
                <div>
                  <label htmlFor="sla-time" className="block text-chalk-200">
                    SLA Time (UTC)
                  </label>
                  <input
                    id="sla-time"
                    type="time"
                    value={slaTime}
                    onChange={(e) => setSla(new Date(`${slaDate}T${e.target.value}:00Z`).toISOString())}
                    className="mt-1 w-full rounded border border-pitch-700 bg-pitch-800 px-3 py-2 text-chalk-50 focus:border-clock-amber focus:outline-none disabled:opacity-50"
                    disabled={isPending}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="notes" className="block text-chalk-200">
                  Notes (optional)
                </label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 w-full rounded border border-pitch-700 bg-pitch-800 px-3 py-2 text-chalk-50 focus:border-clock-amber focus:outline-none disabled:opacity-50"
                  rows={3}
                  disabled={isPending}
                  placeholder="Add internal notes or instructions for collectors"
                />
              </div>

              <div className="rounded border border-clock-amber/30 bg-clock-amber/10 p-3 text-xs text-clock-amber">
                <p className="font-semibold">Important:</p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  <li>Assignment status, started date, and completion date cannot be changed here</li>
                  <li>Changing SLA will not affect the assignment&apos;s current progress</li>
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
                disabled={isPending}
              >
                {isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DISTRIBUTION_TASK_OPTIONS } from "@/lib/distribution-options";
import type { TeamSheetCollector } from "@/lib/sync/google-sheets";
import { updateAssignment } from "@/lib/assignments/actions";
import type { AssignmentRow } from "@/types/database.types";

interface EditAssignmentModalProps {
  assignment: AssignmentRow;
  matchExternalId: string;
  availableCollectors: TeamSheetCollector[];
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
  matchExternalId,
  availableCollectors,
  onClose,
  onSuccess,
}: EditAssignmentModalProps) {
  const router = useRouter();
  const [task, setTask] = useState(assignment.task);
  const taskOptions = [...new Set([...DISTRIBUTION_TASK_OPTIONS, assignment.task])];
  const [addCollectorHrCode, setAddCollectorHrCode] = useState("");
  const [addCollectorTask, setAddCollectorTask] = useState(assignment.task);
  const [addCollectorHalf, setAddCollectorHalf] = useState<string>(assignment.half);
  const [addCollectorShiftDate, setAddCollectorShiftDate] = useState(assignment.shift_date ?? "");
  const [addCollectorError, setAddCollectorError] = useState<string | null>(null);
  const [addingCollector, setAddingCollector] = useState(false);
  const [addCollectorSuccess, setAddCollectorSuccess] = useState<string | null>(null);
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
                <select
                  id="task"
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  className="mt-1 w-full rounded border border-pitch-700 bg-pitch-800 px-3 py-2 text-chalk-50 focus:border-clock-amber focus:outline-none disabled:opacity-50"
                  disabled={isPending}
                >
                  {taskOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
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

              <section className="space-y-3 rounded-lg border border-pitch-700 bg-pitch-950/50 p-4">
                <div>
                  <h3 className="font-semibold text-chalk-50">Add Collector to This Match</h3>
                  <p className="mt-1 text-xs text-chalk-200">Choose a collector from the current Team sheet roster and assign a task without leaving this page.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm text-chalk-200">Collector
                    <select value={addCollectorHrCode} onChange={(e) => setAddCollectorHrCode(e.target.value)} className="mt-1 w-full rounded border border-pitch-700 bg-pitch-800 px-3 py-2 text-chalk-50" disabled={addingCollector || isPending}>
                      <option value="">Select a collector...</option>
                      {availableCollectors.map((person) => <option key={person.hr_code} value={person.hr_code}>{person.full_name} ({person.hr_code})</option>)}
                    </select>
                  </label>
                  <label className="text-sm text-chalk-200">Task
                    <select value={addCollectorTask} onChange={(e) => setAddCollectorTask(e.target.value)} className="mt-1 w-full rounded border border-pitch-700 bg-pitch-800 px-3 py-2 text-chalk-50" disabled={addingCollector || isPending}>
                      {taskOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                  <label className="text-sm text-chalk-200">Half
                    <select value={addCollectorHalf} onChange={(e) => setAddCollectorHalf(e.target.value)} className="mt-1 w-full rounded border border-pitch-700 bg-pitch-800 px-3 py-2 text-chalk-50" disabled={addingCollector || isPending}>
                      {HALF_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                  <label className="text-sm text-chalk-200">Shift Date
                    <input type="date" value={addCollectorShiftDate} onChange={(e) => setAddCollectorShiftDate(e.target.value)} className="mt-1 w-full rounded border border-pitch-700 bg-pitch-800 px-3 py-2 text-chalk-50" disabled={addingCollector || isPending} />
                  </label>
                </div>
                {addCollectorError && <p role="alert" className="rounded border border-red-700 bg-red-900/30 p-2 text-sm text-red-300">{addCollectorError}</p>}
                {addCollectorSuccess && <p role="status" className="rounded border border-green-700 bg-green-900/30 p-2 text-sm text-green-300">{addCollectorSuccess}</p>}
                <button type="button" disabled={!addCollectorHrCode || addingCollector || isPending} onClick={async () => {
                  setAddingCollector(true); setAddCollectorError(null); setAddCollectorSuccess(null);
                  try {
                    const response = await fetch(`/api/matches/${encodeURIComponent(matchExternalId)}/distribution`, {
                      method: "POST", headers: { "content-type": "application/json" },
                      body: JSON.stringify({ assignments: [{ collectorHrCode: addCollectorHrCode, task: addCollectorTask, half: addCollectorHalf, shiftDate: addCollectorShiftDate || null }] }),
                    });
                    const payload = await response.json() as { success?: boolean; error?: string };
                    if (!response.ok || !payload.success) throw new Error(payload.error ?? "Could not add this collector to the match.");
                    const addedName = availableCollectors.find((person) => person.hr_code === addCollectorHrCode)?.full_name ?? addCollectorHrCode;
                    setAddCollectorSuccess(`Added ${addedName} — ${addCollectorTask} · ${addCollectorHalf}.`);
                    setAddCollectorHrCode("");
                    router.refresh();
                  } catch (reason) {
                    setAddCollectorError(reason instanceof Error ? reason.message : "Could not add this collector to the match.");
                  } finally { setAddingCollector(false); }
                }} className="rounded border border-clock-amber/50 px-3 py-2 text-sm font-semibold text-clock-amber hover:bg-clock-amber/10 disabled:opacity-50">{addingCollector ? "Adding..." : "Add Collector"}</button>
              </section>

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

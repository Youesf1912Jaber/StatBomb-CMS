"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DISTRIBUTION_TASK_OPTIONS } from "@/lib/distribution-options";
import type { TeamSheetCollector } from "@/lib/sync/google-sheets";
import { TaskInputModal } from "./TaskInputModal";

type DistributionAssignmentFormProps = {
  matchId: string;
  collectors: TeamSheetCollector[];
};

type PendingAssignment = {
  collectorHrCode: string;
  collectorName: string;
  task: string;
  half: string;
  shiftDate: string | null;
  overTarget: boolean;
  overTargetCount: number | null;
};

const HALF_OPTIONS = ["Half 1", "Half 2", "Half 3", "Half 4", "Full Match"];
const OVER_TARGET_COUNT_OPTIONS = [1, 2, 3, 4];
const ADD_NEW_TASK_SENTINEL = "__ADD_NEW_TASK__";

export function DistributionAssignmentForm({ matchId, collectors }: DistributionAssignmentFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [collectorHrCode, setCollectorHrCode] = useState("");
  const [task, setTask] = useState("");
  const [half, setHalf] = useState(HALF_OPTIONS[0] ?? "Half 1");
  const [shiftDate, setShiftDate] = useState("");
  const [overTarget, setOverTarget] = useState(false);
  const [overTargetCount, setOverTargetCount] = useState<number | null>(null);
  const [pending, setPending] = useState<PendingAssignment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showTaskInput, setShowTaskInput] = useState(false);

  // Collect all available tasks: predefined + custom from pending
  const customTasks = pending
    .map((p) => p.task)
    .filter((t) => !DISTRIBUTION_TASK_OPTIONS.includes(t as any));
  const uniqueCustomTasks = [...new Set(customTasks)];
  const availableTasks = [...DISTRIBUTION_TASK_OPTIONS, ...uniqueCustomTasks];

  function resetEntry() {
    setCollectorHrCode("");
    setTask("");
    setHalf(HALF_OPTIONS[0] ?? "Half 1");
    setShiftDate("");
    setOverTarget(false);
    setOverTargetCount(null);
  }

  function addCollector() {
    const collector = collectors.find((candidate) => candidate.hr_code === collectorHrCode);
    if (!collector || !task) {
      setError("Select a collector and task before adding it.");
      return;
    }
    
    if (overTarget && !overTargetCount) {
      setError("Count is required when Over Target is selected.");
      return;
    }

    const duplicate = pending.some((item) =>
      item.collectorHrCode.toUpperCase() === collectorHrCode.toUpperCase() &&
      item.task.toLowerCase() === task.toLowerCase() &&
      item.half.toLowerCase() === half.toLowerCase()
    );
    if (duplicate) {
      setError("Duplicate assignment detected in the pending list.");
      return;
    }
    setPending((items) => [...items, { 
      collectorHrCode, 
      collectorName: collector.full_name, 
      task, 
      half, 
      shiftDate: shiftDate || null,
      overTarget,
      overTargetCount: overTarget ? overTargetCount : null,
    }]);
    setError(null);
    resetEntry();
  }

  function cancel() {
    setPending([]);
    resetEntry();
    setError(null);
    setSuccess(null);
    setOpen(false);
  }

  function handleAddTask(newTask: string) {
    setTask(newTask);
    setShowTaskInput(false);
  }

  function handleTaskSelectChange(value: string) {
    if (value === ADD_NEW_TASK_SENTINEL) {
      setShowTaskInput(true);
      setTask("");
    } else {
      setTask(value);
    }
  }

  async function confirm() {
    if (pending.length === 0) {
      setError("Add at least one assignment before confirming.");
      return;
    }
    if (!window.confirm(`You are about to add ${pending.length} assignment${pending.length === 1 ? "" : "s"} to the Distribution Google Sheet.`)) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/matches/${encodeURIComponent(matchId)}/distribution`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assignments: pending.map(({ collectorHrCode: code, task: value, half: selectedHalf, shiftDate: selectedShiftDate, overTarget: ot, overTargetCount: otCount }) => ({ collectorHrCode: code, task: value, half: selectedHalf, shiftDate: selectedShiftDate, overTarget: ot, overTargetCount: otCount })) }),
      });
      const payload = await response.json() as { success?: boolean; error?: string; count?: number; assignments?: Array<{ id: string; task: string; half: string }> };
      if (!response.ok || !payload.success) throw new Error(payload.error ?? "The assignments could not be created.");
      setPending([]);
      resetEntry();
      setOpen(false);
      const details = (payload.assignments ?? []).map((assignment) => `${assignment.task} · ${assignment.half} · ${assignment.id}`).join("; ");
      setSuccess(`Assignment added successfully.${details ? ` ${details}` : ""}`);
      router.refresh();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "The assignments could not be created.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <div className="space-y-3">
        {success && <p role="status" className="rounded-[8px] border border-green-900 bg-green-950/30 px-4 py-3 text-sm text-green-200">{success}</p>}
        <button type="button" onClick={() => { setOpen(true); setSuccess(null); }} className="inline-flex rounded-[8px] bg-clock-amber px-4 py-2 text-sm font-medium text-pitch-950">
          Add Assignment
        </button>
      </div>
    );
  }

  return (
    <>
      <section className="space-y-4 rounded-card border border-pitch-700 bg-pitch-900 p-5">
        <div>
          <p className="font-display text-lg text-chalk-50">Add Assignments for Match {matchId}</p>
          <p className="mt-1 text-sm text-chalk-200">Assignments are written only after Confirm.</p>
        </div>
        {error && <p role="alert" className="rounded-[8px] border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</p>}
        <div className="grid gap-4 sm:grid-cols-4">
          <label className="text-sm text-chalk-200">Collector
            <select required value={collectorHrCode} onChange={(event) => setCollectorHrCode(event.target.value)} className="mt-1 block w-full rounded-[8px] border border-pitch-700 bg-pitch-950 px-3 py-2 text-sm text-chalk-50">
              <option value="">Select a collector</option>
              {collectors.map((collector) => <option key={collector.hr_code} value={collector.hr_code}>{collector.full_name} ({collector.hr_code})</option>)}
            </select>
          </label>
          <label className="text-sm text-chalk-200">Task
            <select required value={task} onChange={(event) => handleTaskSelectChange(event.target.value)} className="mt-1 block w-full rounded-[8px] border border-pitch-700 bg-pitch-950 px-3 py-2 text-sm text-chalk-50">
              <option value="">Select a task</option>
              {DISTRIBUTION_TASK_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              {uniqueCustomTasks.map((option) => <option key={option} value={option}>{option}</option>)}
              <option value={ADD_NEW_TASK_SENTINEL}>+ Add New Task</option>
            </select>
          </label>
          <label className="text-sm text-chalk-200">Half
            <select required value={half} onChange={(event) => setHalf(event.target.value)} className="mt-1 block w-full rounded-[8px] border border-pitch-700 bg-pitch-950 px-3 py-2 text-sm text-chalk-50">
              {HALF_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="text-sm text-chalk-200">Shift Date
            <input type="date" value={shiftDate} onChange={(event) => setShiftDate(event.target.value)} className="mt-1 block w-full rounded-[8px] border border-pitch-700 bg-pitch-950 px-3 py-2 text-sm text-chalk-50" />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-chalk-200">
            <input type="checkbox" checked={overTarget} onChange={(event) => {
              setOverTarget(event.target.checked);
              if (!event.target.checked) {
                setOverTargetCount(null);
              }
            }} className="rounded border border-pitch-700" />
            Over Target
          </label>
          {overTarget && (
            <label className="text-sm text-chalk-200">Count (required)
              <select required value={overTargetCount ?? ""} onChange={(event) => setOverTargetCount(event.target.value ? Number(event.target.value) : null)} className="mt-1 block w-full rounded-[8px] border border-pitch-700 bg-pitch-950 px-3 py-2 text-sm text-chalk-50">
                <option value="">Select count</option>
                {OVER_TARGET_COUNT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          )}
        </div>
        <button type="button" onClick={addCollector} disabled={submitting} className="rounded-[8px] border border-pitch-700 px-3 py-2 text-sm text-chalk-50 hover:border-clock-amber">Add Collector</button>
        <div>
          <p className="mb-2 text-sm text-chalk-200">Pending Assignments ({pending.length})</p>
          {pending.length > 0 && <div className="overflow-x-auto rounded-[8px] border border-pitch-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-pitch-950 text-xs uppercase text-pitch-500"><tr><th className="px-3 py-2">Collector</th><th className="px-3 py-2">Task</th><th className="px-3 py-2">Half</th><th className="px-3 py-2">Over Target</th><th className="px-3 py-2">Action</th></tr></thead>
              <tbody className="divide-y divide-pitch-800">
                {pending.map((item, index) => <tr key={`${item.collectorHrCode}-${item.task}-${item.half}-${index}`}><td className="px-3 py-2">{item.collectorName} ({item.collectorHrCode})</td><td className="px-3 py-2">{item.task}</td><td className="px-3 py-2">{item.half}</td><td className="px-3 py-2">{item.overTarget ? `Yes (Count: ${item.overTargetCount})` : "No"}</td><td className="px-3 py-2"><button type="button" onClick={() => setPending((items) => items.filter((_, i) => i !== index))} className="text-red-400 hover:text-red-300">Remove</button></td></tr>)}
              </tbody>
            </table>
          </div>}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={cancel} disabled={submitting} className="rounded-[8px] border border-pitch-700 px-4 py-2 text-sm text-chalk-50">Cancel</button>
          <button type="button" onClick={confirm} disabled={submitting} className="rounded-[8px] bg-clock-amber px-4 py-2 text-sm font-medium text-pitch-950 disabled:opacity-50">{submitting ? "Confirming..." : "Confirm"}</button>
        </div>
      </section>
      {showTaskInput && (
        <TaskInputModal
          existingTasks={availableTasks}
          onAdd={handleAddTask}
          onCancel={() => {
            setShowTaskInput(false);
            setTask("");
          }}
        />
      )}
    </>
  );
}

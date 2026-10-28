"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DISTRIBUTION_TASK_OPTIONS } from "@/lib/distribution-options";
import { formatAddAssignmentFeedback } from "@/lib/over-target/add-assignment-feedback";
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
  const [collectorSearch, setCollectorSearch] = useState("");
  const [collectorSuggestionsOpen, setCollectorSuggestionsOpen] = useState(false);
  const [activeCollectorSuggestion, setActiveCollectorSuggestion] = useState(0);
  const [task, setTask] = useState("");
  const [half, setHalf] = useState(HALF_OPTIONS[0] ?? "Half 1");
  const [shiftDate, setShiftDate] = useState("");
  const [overTarget, setOverTarget] = useState(false);
  const [overTargetCount, setOverTargetCount] = useState<number | null>(null);
  const [pending, setPending] = useState<PendingAssignment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [showTaskInput, setShowTaskInput] = useState(false);

  // Collect all available tasks: predefined + custom from pending
  const customTasks = pending
    .map((p) => p.task)
    .filter((t) => !DISTRIBUTION_TASK_OPTIONS.includes(t as any));
  const uniqueCustomTasks = [...new Set(customTasks)];
  const availableTasks = [...DISTRIBUTION_TASK_OPTIONS, ...uniqueCustomTasks];

  const normalizedCollectorSearch = collectorSearch.trim().toLocaleLowerCase();
  const filteredCollectors = normalizedCollectorSearch
    ? collectors
        .filter((collector) =>
          collector.hr_code.toLocaleLowerCase().includes(normalizedCollectorSearch) ||
          collector.full_name.toLocaleLowerCase().includes(normalizedCollectorSearch)
        )
        .sort((a, b) => {
          const aCode = a.hr_code.toLocaleLowerCase().startsWith(normalizedCollectorSearch) ? 0 : 1;
          const bCode = b.hr_code.toLocaleLowerCase().startsWith(normalizedCollectorSearch) ? 0 : 1;
          if (aCode !== bCode) return aCode - bCode;
          const aName = a.full_name.toLocaleLowerCase().startsWith(normalizedCollectorSearch) ? 0 : 1;
          const bName = b.full_name.toLocaleLowerCase().startsWith(normalizedCollectorSearch) ? 0 : 1;
          return aName - bName || a.hr_code.localeCompare(b.hr_code);
        })
        .slice(0, 8)
    : collectors.slice(0, 8);

  function selectCollector(collector: TeamSheetCollector) {
    setCollectorHrCode(collector.hr_code);
    setCollectorSearch(collector.hr_code + " — " + collector.full_name);
    setCollectorSuggestionsOpen(false);
    setActiveCollectorSuggestion(0);
    setError(null);
  }

  function resetEntry() {
    setCollectorHrCode("");
    setCollectorSearch("");
    setCollectorSuggestionsOpen(false);
    setActiveCollectorSuggestion(0);
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
    setWarnings([]);
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
    setWarnings([]);
    try {
      const response = await fetch(`/api/matches/${encodeURIComponent(matchId)}/distribution`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assignments: pending.map(({ collectorHrCode: code, task: value, half: selectedHalf, shiftDate: selectedShiftDate, overTarget: ot, overTargetCount: otCount }) => ({ collectorHrCode: code, task: value, half: selectedHalf, shiftDate: selectedShiftDate, overTarget: ot, overTargetCount: otCount })) }),
      });
      const payload = await response.json() as { success?: boolean; error?: string; count?: number; assignments?: Array<{ id: string; task: string; half: string }>; warnings?: string[]; overTargetSheetFailed?: boolean };
      if (!response.ok || !payload.success) throw new Error(payload.error ?? "The assignments could not be created.");
      setPending([]);
      resetEntry();
      setOpen(false);
      const feedback = formatAddAssignmentFeedback(payload);
      setSuccess(feedback.successMessage);
      setWarnings(feedback.warnings);
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
        {warnings.length > 0 && (
          <div role="status" className="space-y-2">
            {warnings.map((warning) => (
              <p key={warning} className="rounded-[8px] border border-amber-900 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">{warning}</p>
            ))}
          </div>
        )}
        <button type="button" onClick={() => { setOpen(true); setSuccess(null); setWarnings([]); }} className="inline-flex rounded-[8px] bg-clock-amber px-4 py-2 text-sm font-medium text-pitch-950">
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
          <div className="relative text-sm text-chalk-200">
            <label htmlFor="distribution-collector-search" className="block">Collector</label>
            <input
              id="distribution-collector-search"
              type="search"
              autoComplete="off"
              required
              value={collectorSearch}
              placeholder="Search HR Code or name…"
              aria-label="Search collector by HR Code or name"
              aria-expanded={collectorSuggestionsOpen}
              aria-controls="distribution-collector-suggestions"
              aria-autocomplete="list"
              role="combobox"
              onFocus={(event) => {
                if (collectorHrCode) {
                  event.currentTarget.select();
                } else {
                  setCollectorSuggestionsOpen(true);
                }
              }}
              onChange={(event) => {
                const value = event.target.value;
                setCollectorSearch(value);
                setCollectorHrCode("");
                setActiveCollectorSuggestion(0);
                setCollectorSuggestionsOpen(true);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setCollectorSuggestionsOpen(false);
                } else if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setCollectorSuggestionsOpen(true);
                  setActiveCollectorSuggestion((index) => Math.min(index + 1, Math.max(filteredCollectors.length - 1, 0)));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveCollectorSuggestion((index) => Math.max(index - 1, 0));
                } else if (event.key === "Enter" && collectorSuggestionsOpen && filteredCollectors.length > 0) {
                  event.preventDefault();
                  selectCollector(filteredCollectors[activeCollectorSuggestion] ?? filteredCollectors[0]);
                }
              }}
              className="mt-1 block w-full rounded-[8px] border border-pitch-700 bg-pitch-950 px-3 py-2 text-sm text-chalk-50 placeholder:text-chalk-400 focus:border-clock-amber focus:outline-none focus:ring-1 focus:ring-clock-amber"
            />
            {collectorSuggestionsOpen && (
              <div id="distribution-collector-suggestions" role="listbox" aria-label="Collector suggestions" className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-[8px] border border-pitch-700 bg-pitch-950 py-1 shadow-2xl">
                {filteredCollectors.length > 0 ? filteredCollectors.map((collector, index) => (
                  <button
                    key={collector.hr_code}
                    type="button"
                    role="option"
                    aria-selected={collectorHrCode === collector.hr_code || activeCollectorSuggestion === index}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveCollectorSuggestion(index)}
                    onClick={() => selectCollector(collector)}
                    className={"flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-pitch-800 focus:bg-pitch-800 focus:outline-none " + (activeCollectorSuggestion === index ? "bg-pitch-800" : "")}
                  >
                    <span className="shrink-0 rounded-md border border-pitch-700 bg-pitch-900 px-2 py-1 font-mono text-xs font-semibold text-clock-amber">{collector.hr_code}</span>
                    <span className="min-w-0 truncate text-chalk-50">{collector.full_name}</span>
                  </button>
                )) : <p className="px-3 py-3 text-sm text-chalk-300">No collectors match that HR Code or name.</p>}
              </div>
            )}
            {collectorHrCode && <p className="mt-1 text-xs text-emerald-200">Selected: {collectorHrCode}</p>}
          </div>
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

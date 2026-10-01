"use client";

import { useState } from "react";
import { normalizeDistributionTask } from "@/lib/sync/distribution-identity";
import { areTasksDuplicate } from "@/lib/distribution-validation";

type TaskInputModalProps = {
  existingTasks: string[];
  onAdd: (task: string) => void;
  onCancel: () => void;
};

export function TaskInputModal({ existingTasks, onAdd, onCancel }: TaskInputModalProps) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    const trimmed = input.trim();

    // Validation: non-empty
    if (!trimmed) {
      setError("Task name cannot be empty.");
      return;
    }

    // Normalize to check final form
    const normalized = normalizeDistributionTask(trimmed);
    if (!normalized) {
      setError("Task name is invalid after normalization.");
      return;
    }

    // Check for duplicates using existing normalization logic
    if (existingTasks.some((existing) => areTasksDuplicate(existing, normalized))) {
      setError("This task already exists.");
      return;
    }

    setError(null);
    onAdd(normalized);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-input-title"
        className="w-full max-w-sm space-y-4 rounded-[8px] border border-pitch-700 bg-pitch-900 p-4 shadow-xl"
      >
        <h2 id="task-input-title" className="text-sm font-medium text-chalk-50">
          Add New Task
        </h2>
        <input
          type="text"
          placeholder="Enter task name"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          autoFocus
          className="w-full rounded-[6px] border border-pitch-700 bg-pitch-950 px-3 py-2 text-sm text-chalk-50 placeholder-pitch-600 focus:border-clock-amber focus:outline-none"
        />
        {error && <p className="text-xs text-red-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[6px] border border-pitch-700 px-3 py-1.5 text-xs text-chalk-50 hover:border-clock-amber"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAdd}
            className="rounded-[6px] bg-clock-amber px-3 py-1.5 text-xs font-medium text-pitch-950 hover:bg-clock-amber/90"
          >
            Add Task
          </button>
        </div>
      </div>
    </div>
  );
}

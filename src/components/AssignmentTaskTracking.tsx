"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { endAssignmentTask, startAssignmentTask } from "@/lib/assignments/actions";
import {
  ASSIGNMENT_TASK_NAMES,
  formatDurationSeconds,
  type AssignmentTaskName,
} from "@/lib/assignments/task-names";
import type { AssignmentStatus, AssignmentTaskTimerRow } from "@/types/database.types";

interface AssignmentTaskTrackingProps {
  assignmentId: string;
  status: AssignmentStatus;
  startedAt: string | null;
  timers: AssignmentTaskTimerRow[];
}

type TaskView = {
  name: AssignmentTaskName;
  timer: AssignmentTaskTimerRow | undefined;
  isActive: boolean;
  isEnded: boolean;
};

function elapsedSecondsFrom(startedAt: string, nowMs: number): number {
  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) return 0;
  return Math.max(0, Math.floor((nowMs - started) / 1000));
}

export function AssignmentTaskTracking({
  assignmentId,
  status,
  startedAt,
  timers,
}: AssignmentTaskTrackingProps) {
  // Visibility is keyed off status, not started_at: an In Progress assignment
  // must always expose task tracking. Started tasks remain start-blocked by
  // the RPC when started_at is null (e.g. an Overdue assignment that never
  // started), so only enable mutation when the assignment is actually started.
  if (status === "Not Started") return null;

  const canMutate = status === "In Progress" || (status === "Overdue" && startedAt !== null);

  return (
    <AssignmentTaskTrackingInner
      assignmentId={assignmentId}
      timers={timers}
      canMutate={canMutate}
    />
  );
}

function AssignmentTaskTrackingInner({
  assignmentId,
  timers,
  canMutate,
}: {
  assignmentId: string;
  timers: AssignmentTaskTimerRow[];
  canMutate: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingTask, setPendingTask] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());

  const timerByName = useMemo(() => {
    const map = new Map<string, AssignmentTaskTimerRow>();
    for (const timer of timers) {
      map.set(timer.task_name, timer);
    }
    return map;
  }, [timers]);

  const rows: TaskView[] = ASSIGNMENT_TASK_NAMES.map((name) => {
    const timer = timerByName.get(name);
    return {
      name,
      timer,
      isActive: Boolean(timer && timer.ended_at === null),
      isEnded: Boolean(timer && timer.ended_at !== null),
    };
  });

  const activeTimer = rows.find((row) => row.isActive)?.timer ?? null;

  useEffect(() => {
    if (!activeTimer) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [activeTimer]);

  function handleStart(taskName: AssignmentTaskName) {
    if (isPending || pendingTask || activeTimer) return;
    setError(null);
    setPendingTask(taskName);
    startTransition(async () => {
      const result = await startAssignmentTask(assignmentId, taskName);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
      setPendingTask(null);
    });
  }

  function handleEnd(taskName: AssignmentTaskName) {
    if (isPending || pendingTask) return;
    setError(null);
    setPendingTask(taskName);
    startTransition(async () => {
      const result = await endAssignmentTask(assignmentId, taskName);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
      setPendingTask(null);
    });
  }

  return (
    <div>
      <h2 className="font-display text-lg text-chalk-50">Task Tracking</h2>
      <div className="mt-2 overflow-x-auto rounded-card border border-pitch-700">
        <table className="w-full min-w-[28rem] text-left text-sm">
          <thead className="border-b border-pitch-700 bg-pitch-900 text-chalk-200">
            <tr>
              <th className="px-4 py-2.5 font-medium">Task Name</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Start/End</th>
              <th className="px-4 py-2.5 font-medium">Duration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-pitch-800">
            {rows.map((row) => {
              const busy = isPending && pendingTask === row.name;
              const duration = row.isActive && row.timer
                ? formatDurationSeconds(elapsedSecondsFrom(row.timer.started_at, now))
                : row.isEnded && row.timer?.duration_seconds != null
                  ? formatDurationSeconds(row.timer.duration_seconds)
                  : "—";

              return (
                <tr key={row.name}>
                  <td className="px-4 py-2.5 text-chalk-50">{row.name}</td>
                  <td className="px-4 py-2.5 text-chalk-200">
                    {row.isActive ? "Running" : row.isEnded ? "Ended" : "Not started"}
                  </td>
                  <td className="px-4 py-2.5">
                    {row.isEnded ? (
                      <span className="text-chalk-200">Ended</span>
                    ) : row.isActive ? (
                      <button
                        type="button"
                        onClick={() => handleEnd(row.name)}
                        disabled={!canMutate || isPending}
                        className="rounded-card bg-clock-red px-3 py-1.5 text-xs font-semibold text-chalk-50 transition-colors hover:bg-[#a83a26] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busy ? "Ending…" : "End"}
                      </button>
                    ) : canMutate ? (
                      <button
                        type="button"
                        onClick={() => handleStart(row.name)}
                        disabled={isPending || Boolean(activeTimer)}
                        className="rounded-card bg-clock-amber px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-[#e3b45c] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busy ? "Starting…" : "Start"}
                      </button>
                    ) : (
                      <span className="text-chalk-200">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-chalk-50">{duration}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-clock-red">
          {error}
        </p>
      )}
    </div>
  );
}

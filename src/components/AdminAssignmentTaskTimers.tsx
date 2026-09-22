"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ASSIGNMENT_TASK_NAMES,
  formatDurationSeconds,
  type AssignmentTaskName,
} from "@/lib/assignments/task-names";
import type { AssignmentTaskTimerRow } from "@/types/database.types";

interface AdminAssignmentTaskTimersProps {
  timers: AssignmentTaskTimerRow[];
}

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function elapsedSecondsFrom(startedAt: string, nowMs: number): number {
  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) return 0;
  return Math.max(0, Math.floor((nowMs - started) / 1000));
}

export function AdminAssignmentTaskTimers({ timers }: AdminAssignmentTaskTimersProps) {
  const [now, setNow] = useState(() => Date.now());

  const timerByName = useMemo(() => {
    const map = new Map<string, AssignmentTaskTimerRow>();
    for (const timer of timers) {
      map.set(timer.task_name, timer);
    }
    return map;
  }, [timers]);

  const rows = ASSIGNMENT_TASK_NAMES.map((name: AssignmentTaskName) => {
    const timer = timerByName.get(name);
    return {
      name,
      timer,
      isActive: Boolean(timer && timer.ended_at === null),
      isEnded: Boolean(timer && timer.ended_at !== null),
    };
  });

  const hasActive = rows.some((row) => row.isActive);

  useEffect(() => {
    if (!hasActive) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [hasActive]);

  const totalTracked = timers.reduce((sum, timer) => sum + (timer.duration_seconds ?? 0), 0);

  return (
    <div>
      <h2 className="font-display text-lg text-chalk-50">Task Tracking</h2>
      <div className="mt-2 overflow-x-auto rounded-card border border-pitch-700">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="border-b border-pitch-700 bg-pitch-900 text-chalk-200">
            <tr>
              <th className="px-4 py-2.5 font-medium">Task</th>
              <th className="px-4 py-2.5 font-medium">Started</th>
              <th className="px-4 py-2.5 font-medium">Ended</th>
              <th className="px-4 py-2.5 font-medium">Duration</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-pitch-800">
            {rows.map((row) => {
              const duration = row.isActive && row.timer
                ? formatDurationSeconds(elapsedSecondsFrom(row.timer.started_at, now))
                : row.isEnded && row.timer?.duration_seconds != null
                  ? formatDurationSeconds(row.timer.duration_seconds)
                  : "—";

              return (
                <tr key={row.name}>
                  <td className="px-4 py-2.5 text-chalk-50">{row.name}</td>
                  <td className="px-4 py-2.5 text-chalk-50">{formatTimestamp(row.timer?.started_at ?? null)}</td>
                  <td className="px-4 py-2.5 text-chalk-50">{formatTimestamp(row.timer?.ended_at ?? null)}</td>
                  <td className="px-4 py-2.5 font-mono text-chalk-50">{duration}</td>
                  <td className="px-4 py-2.5 text-chalk-200">
                    {row.isActive ? "Running" : row.isEnded ? "Ended" : "Not started"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-chalk-50">
        Total tracked task time{" "}
        <span className="font-mono">{formatDurationSeconds(totalTracked)}</span>
      </p>
    </div>
  );
}

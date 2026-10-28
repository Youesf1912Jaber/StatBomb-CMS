"use client";

import { useEffect, useState } from "react";
import { formatDurationSeconds } from "@/lib/assignments/task-names";
import type { AssignmentTaskTimerRow } from "@/types/database.types";

type TimerDurationInput = Pick<AssignmentTaskTimerRow, "started_at" | "ended_at" | "duration_seconds">;

function elapsedSeconds(startedAt: string, nowMs: number) {
  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((nowMs - start) / 1000));
}

export function LiveTrackedDuration({ timers, className = "" }: { timers: TimerDurationInput[]; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  const hasRunningTimer = timers.some((timer) => !timer.ended_at);

  useEffect(() => {
    if (!hasRunningTimer) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [hasRunningTimer]);

  const totalSeconds = timers.reduce((sum, timer) => {
    if (timer.ended_at && timer.duration_seconds !== null) return sum + timer.duration_seconds;
    if (!timer.ended_at) return sum + elapsedSeconds(timer.started_at, now);
    return sum;
  }, 0);

  return <span className={className}>{formatDurationSeconds(totalSeconds)}</span>;
}

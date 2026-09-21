"use client";

import { useEffect, useState } from "react";

interface SlaCountdownProps {
  /** Absolute SLA deadline as an ISO timestamp — the only source of truth. */
  sla: string;
  /** Assignment status; countdown is only meaningful while not Completed. */
  status: "Not Started" | "In Progress" | "Completed" | "Overdue";
}

function formatRemaining(ms: number): string {
  const overdue = ms < 0;
  const abs = Math.abs(ms);
  const totalSeconds = Math.floor(abs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, "0");
  const clock = hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;

  return overdue ? `-${clock}` : clock;
}

/**
 * Always recomputes remaining time from the absolute `sla` timestamp on
 * every render/tick — never from a duration stored at mount time — so a
 * page refresh (or the tab being backgrounded and returning) reflects the
 * true remaining time rather than resuming a stale countdown.
 */
export function SlaCountdown({ sla, status }: SlaCountdownProps) {
  const slaMs = new Date(sla).getTime();
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (status === "Completed") return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [status]);

  if (status === "Completed") {
    return <span className="font-mono text-sm text-chalk-200">Completed</span>;
  }

  const remainingMs = slaMs - now;
  const isOverdue = remainingMs < 0;

  return (
    <span
      className={`font-mono text-sm ${isOverdue ? "text-clock-red" : "text-chalk-50"}`}
      aria-live="polite"
    >
      {formatRemaining(remainingMs)}
      {isOverdue ? " overdue" : ""}
    </span>
  );
}

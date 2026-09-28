"use client";

import type { SlaAlertAssignment } from "@/lib/assignments/sla-alarm";

interface SlaAlertCardProps {
  assignment: SlaAlertAssignment;
  onStop: (assignment: SlaAlertAssignment) => void;
}

function formatDeadline(sla: string): string | null {
  const date = new Date(sla);
  if (!Number.isFinite(date.getTime())) return null;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function SlaAlertCard({ assignment, onStop }: SlaAlertCardProps) {
  const deadline = formatDeadline(assignment.sla);

  return (
    <section
      aria-live="assertive"
      className="w-full max-w-md rounded-card border border-clock-amber bg-pitch-900 p-5 shadow-2xl ring-1 ring-clock-amber/30"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-clock-amber">
            SLA Warning
          </p>
          <h2 className="mt-2 font-display text-xl text-chalk-50">
            {assignment.homeTeam} vs {assignment.awayTeam}
          </h2>
        </div>
        <span className="rounded-full bg-clock-amber/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-clock-amber">
          1 hour left
        </span>
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        {assignment.competition && (
          <div className="flex justify-between gap-4">
            <dt className="text-pitch-500">Competition</dt>
            <dd className="text-right text-chalk-100">{assignment.competition}</dd>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <dt className="text-pitch-500">Assignment</dt>
          <dd className="text-right text-chalk-100">
            {assignment.half} — {assignment.collectorName}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-pitch-500">Task</dt>
          <dd className="text-right text-chalk-100">{assignment.task}</dd>
        </div>
        {deadline && (
          <div className="flex justify-between gap-4">
            <dt className="text-pitch-500">Deadline</dt>
            <dd className="text-right font-mono text-xs text-chalk-100">{deadline}</dd>
          </div>
        )}
      </dl>

      <button
        type="button"
        onClick={() => onStop(assignment)}
        className="mt-5 w-full rounded-[8px] bg-clock-amber px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-[#e5b454] focus:outline-none focus:ring-2 focus:ring-chalk-50 focus:ring-offset-2 focus:ring-offset-pitch-900"
      >
        Stop Alarm
      </button>
    </section>
  );
}

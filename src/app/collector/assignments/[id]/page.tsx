import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import { getAssignmentById, getAssignmentTaskTimers, getMatchCollaborators } from "@/lib/assignments/queries";
import { SlaCountdown } from "@/components/SlaCountdown";
import { AssignmentWorkControls } from "@/components/AssignmentWorkControls";
import { AssignmentTaskTracking } from "@/components/AssignmentTaskTracking";

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function AssignmentDetailsPage({ params }: { params: { id: string } }) {
  const profile = await getProfileOrRedirect();
  const supabase = createClient();

  // RLS (`collector_id = auth.uid() OR is_admin()`) already scopes this —
  // a collector requesting someone else's assignment id gets no row back,
  // which we treat the same as "doesn't exist" rather than leaking that it
  // exists but belongs to someone else.
  const assignment = await getAssignmentById(supabase, params.id);
  if (!assignment) {
    notFound();
  }

  const collaborators = await getMatchCollaborators(supabase, assignment.match_id);
  const others = collaborators.filter((c) => c.collector_id !== profile.id);
  const taskTimers = await getAssignmentTaskTimers(supabase, assignment.id);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-pitch-500">
          {assignment.match.competition ?? "Match"}
        </p>
        <h1 className="mt-1 font-display text-2xl text-chalk-50">
          {assignment.match.home_team} vs {assignment.match.away_team}
        </h1>
        <p className="mt-1 text-sm text-chalk-200">
          {new Date(assignment.match.match_date).toLocaleDateString(undefined, { dateStyle: "medium" })}
        </p>
      </div>

      {assignment.match.official_website_url && (
        <a
          href={assignment.match.official_website_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-card border border-pitch-700 px-4 py-2 text-sm text-chalk-50 transition-colors hover:border-clock-amber"
        >
          Official Website ↗
        </a>
      )}

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-card border border-pitch-700 bg-pitch-900 p-5 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-chalk-200">Task</dt>
          <dd className="mt-0.5 text-chalk-50">{assignment.task}</dd>
        </div>
        <div>
          <dt className="text-chalk-200">Half</dt>
          <dd className="mt-0.5 text-chalk-50">{assignment.half}</dd>
        </div>
        <div>
          <dt className="text-chalk-200">Status</dt>
          <dd className="mt-0.5 text-chalk-50">{assignment.status}</dd>
        </div>
        <div>
          <dt className="text-chalk-200">SLA</dt>
          <dd className="mt-0.5">
            <SlaCountdown sla={assignment.sla} status={assignment.status} />
          </dd>
        </div>
        <div>
          <dt className="text-chalk-200">Started</dt>
          <dd className="mt-0.5 text-chalk-50">{formatTimestamp(assignment.started_at)}</dd>
        </div>
        <div>
          <dt className="text-chalk-200">Completed</dt>
          <dd className="mt-0.5 text-chalk-50">{formatTimestamp(assignment.completed_at)}</dd>
        </div>
      </dl>

      {assignment.notes && (
        <div className="rounded-card border border-pitch-700 bg-pitch-900 p-5">
          <dt className="text-sm font-semibold text-chalk-200">Notes</dt>
          <dd className="mt-2 whitespace-pre-wrap text-sm text-chalk-50">{assignment.notes}</dd>
        </div>
      )}

      <AssignmentWorkControls
        assignmentId={assignment.id}
        status={assignment.status}
        hasActiveTaskTimer={taskTimers.some((timer) => timer.ended_at === null)}
      />

      <AssignmentTaskTracking
        assignmentId={assignment.id}
        status={assignment.status}
        startedAt={assignment.started_at}
        timers={taskTimers}
      />

      <div>
        <h2 className="font-display text-lg text-chalk-50">Teammates</h2>
        {others.length === 0 ? (
          <p className="mt-2 rounded-card border border-dashed border-pitch-700 px-4 py-6 text-center text-sm text-chalk-200">
            No other collectors assigned to this match.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-pitch-800 rounded-card border border-pitch-700">
            {others.map((c) => (
              <li key={c.assignment_id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-chalk-50">{c.full_name ?? "Unnamed collector"}</span>
                <span className="text-chalk-200">
                  {c.task} · {c.half} · {c.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

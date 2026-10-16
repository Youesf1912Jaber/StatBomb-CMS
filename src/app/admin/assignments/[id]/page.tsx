import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAssignmentById, getAssignmentTaskTimers, getMatchCollaborators } from "@/lib/assignments/queries";
import { distributionPresenceLabel } from "@/lib/assignments/distribution-presence";
import { getActivityLogsForAssignment } from "@/lib/activity-logs/queries";
import { getHyperCareForMatch } from "@/lib/hyper-care/lookup";
import { SlaCountdown } from "@/components/SlaCountdown";
import { AdminAssignmentTaskTimers } from "@/components/AdminAssignmentTaskTimers";
import { AdminAssignmentActions } from "@/components/AdminAssignmentActions";
import { HyperCareSection } from "@/components/HyperCareSection";
import { ReassignButton } from "./ReassignButton";
import { EditButton } from "./EditButton";
import { EditDistributionDetailsButton } from "./EditDistributionDetailsButton";

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatDateOnly(value: string | null): string {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

export default async function AdminAssignmentDetailsPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const assignment = await getAssignmentById(supabase, params.id);
  if (!assignment) {
    notFound();
  }

  const { data: collector } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("id", assignment.collector_id)
    .maybeSingle();

  const collaborators = await getMatchCollaborators(supabase, assignment.match_id);
  const activityHistory = await getActivityLogsForAssignment(supabase, assignment.id);
  const taskTimers = await getAssignmentTaskTimers(supabase, assignment.id);
  const hyperCare = await getHyperCareForMatch(assignment.match.home_team, assignment.match.away_team);

  const { data: allCollectors } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("role", "collector")
    .order("full_name");

  const availableCollectors = allCollectors ?? [];

  return (
    <div className="w-full min-w-0 space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-pitch-500">
          {assignment.match.competition ?? "Match"}
        </p>
        <h1 className="mt-1 font-display text-2xl text-chalk-50">
          {assignment.match.home_team} vs {assignment.match.away_team}
        </h1>
        <p className="mt-1 text-sm text-chalk-200">
          Assigned to {collector?.full_name ?? collector?.email ?? "Unknown collector"}
        </p>
        {!assignment.distribution_present && (
          <p className="mt-3 rounded-card border border-clock-amber/40 bg-pitch-900 px-4 py-3 text-sm text-clock-amber">
            Distribution Missing/Removed. This assignment is preserved for Admin/history. Status, SLA, and task timers are unchanged.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
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
        <ReassignButton
          assignmentId={assignment.id}
          currentCollectorId={assignment.collector_id}
          currentCollectorName={collector?.full_name ?? collector?.email ?? "Unknown collector"}
          availableCollectors={availableCollectors}
        />
        <EditButton assignment={assignment} />
        <EditDistributionDetailsButton
          assignmentId={assignment.id}
          shiftDate={assignment.shift_date}
          officialWebsiteUrl={assignment.match.official_website_url}
        />
        <AdminAssignmentActions assignmentId={assignment.id} status={assignment.status} />
      </div>

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
          <dt className="text-chalk-200">Distribution</dt>
          <dd className={`mt-0.5 ${assignment.distribution_present ? "text-chalk-50" : "text-clock-amber"}`}>
            {distributionPresenceLabel(assignment.distribution_present)}
          </dd>
        </div>
        <div>
          <dt className="text-chalk-200">Shift Date</dt>
          <dd className="mt-0.5 text-chalk-50">{formatDateOnly(assignment.shift_date)}</dd>
        </div>
        <div>
          <dt className="text-chalk-200">Official Match URL</dt>
          <dd className="mt-0.5 text-chalk-50">
            {assignment.match.official_website_url ? "Set" : "Not set"}
          </dd>
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

      <HyperCareSection sections={hyperCare} />

      {assignment.notes && (
        <div className="rounded-card border border-pitch-700 bg-pitch-900 p-5">
          <dt className="text-sm font-semibold text-chalk-200">Notes</dt>
          <dd className="mt-2 whitespace-pre-wrap text-sm text-chalk-50">{assignment.notes}</dd>
        </div>
      )}

      <div className="grid min-w-0 grid-cols-1 items-start gap-5 xl:grid-cols-2">
        <section className="min-w-0 rounded-card border border-pitch-700 bg-pitch-950/35 p-3 sm:p-4">
          <AdminAssignmentTaskTimers timers={taskTimers} />
        </section>

        <div className="min-w-0 space-y-5">
          {collaborators.length > 1 && (
            <section className="min-w-0">
              <h2 className="font-display text-lg text-chalk-50">All collectors on this match</h2>
              <ul className="mt-2 divide-y divide-pitch-800 overflow-hidden rounded-card border border-pitch-700">
                {collaborators.map((c) => (
                  <li
                    key={c.assignment_id}
                    className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm ${
                      c.assignment_id === assignment.id ? "bg-pitch-900" : ""
                    }`}
                  >
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      {c.assignment_id ? (
                        <Link
                          href={`/admin/assignments/${c.assignment_id}`}
                          className="text-chalk-50 underline decoration-pitch-500 underline-offset-2 transition-colors hover:text-clock-amber"
                        >
                          {c.full_name ?? "Unnamed collector"}
                        </Link>
                      ) : (
                        <span className="text-chalk-50">{c.full_name ?? "Unnamed collector"}</span>
                      )}
                      {c.assignment_id === assignment.id && (
                        <span className="text-xs text-pitch-500">(Current)</span>
                      )}
                    </span>
                    <span className="text-xs text-chalk-200 sm:text-right">
                      {c.task} · {c.half} · {c.status}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="min-w-0">
            <h2 className="font-display text-lg text-chalk-50">Activity History</h2>
            {activityHistory.length === 0 ? (
              <p className="mt-2 rounded-card border border-dashed border-pitch-700 px-4 py-6 text-sm text-chalk-200">
                No activity history for this assignment.
              </p>
            ) : (
              <div className="mt-2 max-h-[32rem] space-y-2 overflow-y-auto pr-1">
                {activityHistory.map((log) => (
                  <div key={log.id} className="rounded-card border border-pitch-700 bg-pitch-900 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-chalk-50">{log.actionLabel}</span>
                      <span className="text-xs text-chalk-200">{formatTimestamp(log.created_at)}</span>
                    </div>
                    <p className="mt-1 text-chalk-200">By {log.userName}</p>
                    <p className="mt-2 text-chalk-50">{log.changeSummary}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

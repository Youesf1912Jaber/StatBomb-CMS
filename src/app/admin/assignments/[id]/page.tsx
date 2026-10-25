import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAssignmentById, getAssignmentTaskTimers, getMatchCollaborators } from "@/lib/assignments/queries";
import { distributionPresenceLabel } from "@/lib/assignments/distribution-presence";
import { getActivityLogsForAssignment } from "@/lib/activity-logs/queries";
import { getHyperCareForMatch } from "@/lib/hyper-care/lookup";
import { getMatchMasterMetadata } from "@/lib/match-master-metadata";
import { pullTeamSheet, normalizeDistributionCollectorHrCode } from "@/lib/sync/google-sheets";
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
  return day + "/" + month + "/" + year;
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 border-b border-pitch-800/80 py-2.5 last:border-b-0 sm:border-b-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.13em] text-chalk-200">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-chalk-50">{children}</dd>
    </div>
  );
}

export default async function AdminAssignmentDetailsPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const assignment = await getAssignmentById(supabase, params.id);
  if (!assignment) notFound();

  const { data: collector } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("id", assignment.collector_id)
    .maybeSingle();

  const collaborators = await getMatchCollaborators(supabase, assignment.match_id);
  const activityHistory = await getActivityLogsForAssignment(supabase, assignment.id);
  const taskTimers = await getAssignmentTaskTimers(supabase, assignment.id);
  const [hyperCare, matchMetadata] = await Promise.all([
    getHyperCareForMatch(assignment.match.home_team, assignment.match.away_team),
    getMatchMasterMetadata(assignment.match.external_id),
  ]);
  const [{ data: allProfiles }, teamRoster] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, hr_code, role, deleted_at, suspended_at").order("full_name"),
    pullTeamSheet(),
  ]);
  const profilesByHrCode = new Map(
    (allProfiles ?? [])
      .filter((profile) => profile.hr_code)
      .map((profile) => [normalizeDistributionCollectorHrCode(profile.hr_code), profile])
  );
  // Match the distribution form: only people on the current Team sheet roster are selectable.
  const availableCollectors = teamRoster
    .filter((person) => person.hr_code && person.status?.trim().toLowerCase() !== "inactive")
    .map((person) => profilesByHrCode.get(normalizeDistributionCollectorHrCode(person.hr_code)))
    .filter((person): person is NonNullable<typeof person> => Boolean(person && !person.deleted_at && !person.suspended_at))
    .map((person) => ({ id: person.id, full_name: person.full_name, email: person.email }));

  return (
    <main className="match-details-page mx-auto w-full min-w-0 max-w-[1440px] space-y-5 pb-8">
      <header className="relative isolate overflow-hidden rounded-xl border border-pitch-700 bg-pitch-950/95 p-4 shadow-xl shadow-black/20 sm:p-6" style={{ backgroundImage: "linear-gradient(115deg, rgba(5,35,32,0.78), rgba(3,24,23,0.72)), url(\"/images/football/Teams%20Vs.png\")", backgroundSize: "cover", backgroundPosition: "center" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/admin" className="inline-flex items-center gap-2 text-xs text-chalk-200 transition hover:text-clock-amber">
            <span aria-hidden="true">←</span> Back to dashboard
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-200">
            <span aria-hidden="true">●</span>{assignment.status}
          </span>
        </div>
        <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.18em] text-chalk-200">
          {(assignment.match.competition ?? "Football").toUpperCase()} <span className="mx-2 text-pitch-500">/</span> {formatDateOnly(assignment.match.match_date)}
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight text-chalk-50 sm:text-4xl">
          {assignment.match.home_team} <span className="text-clock-amber">vs</span> {assignment.match.away_team}
        </h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-chalk-200">
          <span aria-hidden="true">♙</span>
          Assigned to {collector?.full_name ?? collector?.email ?? "Unknown collector"}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <ReassignButton
            assignmentId={assignment.id}
            currentCollectorId={assignment.collector_id}
            currentCollectorName={collector?.full_name ?? collector?.email ?? "Unknown collector"}
            availableCollectors={availableCollectors}
          />
          <EditButton assignment={assignment} matchExternalId={assignment.match.external_id} availableCollectors={teamRoster.filter((person) => person.hr_code && person.status?.trim().toLowerCase() !== "inactive")} />
          <EditDistributionDetailsButton
            assignmentId={assignment.id}
            shiftDate={assignment.shift_date}
            officialWebsiteUrl={assignment.match.official_website_url}
          />
          {assignment.match.official_website_url && (
            <a href={assignment.match.official_website_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center rounded-md border border-pitch-700 bg-pitch-900 px-3.5 py-2 text-xs font-semibold text-chalk-50 transition hover:border-clock-amber">
              Official Match ↗
            </a>
          )}
          <AdminAssignmentActions assignmentId={assignment.id} status={assignment.status} />
        </div>
        {!assignment.distribution_present && (
          <p className="mt-4 rounded-lg border border-clock-amber/35 bg-black/20 px-4 py-3 text-sm text-clock-amber">
            Distribution Missing/Removed. This assignment is preserved for Admin/history. Status, SLA, and task timers are unchanged.
          </p>
        )}
      </header>

      <HyperCareSection sections={hyperCare} />

      <section className="overflow-hidden rounded-xl border border-pitch-700 bg-pitch-900 shadow-lg shadow-black/10">
        <header className="border-b border-pitch-700 bg-[#103a34] px-4 py-3">
          <h2 className="font-display text-base font-semibold text-chalk-50">Match information</h2>
        </header>
        <dl className="grid grid-cols-1 gap-x-5 px-4 py-2 sm:grid-cols-2 sm:px-5 lg:grid-cols-3">
          <DetailField label="Competition">{matchMetadata.competition ?? assignment.match.competition ?? "—"}</DetailField>
          <DetailField label="Country">{matchMetadata.country ?? "—"}</DetailField>
          <DetailField label="Task">{assignment.task}</DetailField>
          <DetailField label="Half">{assignment.half}</DetailField>
          <DetailField label="Status"><span className={assignment.status === "Completed" ? "text-emerald-300" : assignment.status === "Overdue" ? "text-rose-300" : "text-chalk-50"}>{assignment.status}</span></DetailField>
          <DetailField label="Distribution"><span className={assignment.distribution_present ? "text-chalk-50" : "text-clock-amber"}>{distributionPresenceLabel(assignment.distribution_present)}</span></DetailField>
          <DetailField label="Shift Date">{formatDateOnly(assignment.shift_date)}</DetailField>
          <DetailField label="Official Match URL">
            {assignment.match.official_website_url ? (
              <a href={assignment.match.official_website_url} target="_blank" rel="noopener noreferrer" className="text-clock-amber underline underline-offset-2">Open official URL ↗</a>
            ) : "Not set"}
          </DetailField>
          <DetailField label="SLA"><SlaCountdown sla={assignment.sla} status={assignment.status} /></DetailField>
          <DetailField label="Started">{formatTimestamp(assignment.started_at)}</DetailField>
          <DetailField label="Completed">{formatTimestamp(assignment.completed_at)}</DetailField>
        </dl>
      </section>

      {assignment.notes && (
        <section className="rounded-xl border border-pitch-700 bg-pitch-900 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-chalk-200">Assignment notes</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-chalk-50">{assignment.notes}</p>
        </section>
      )}

      <div className="grid min-w-0 grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]">
        <section className="min-w-0 overflow-hidden rounded-xl border border-pitch-700 bg-pitch-900 p-3 sm:p-4">
          <AdminAssignmentTaskTimers timers={taskTimers} />
        </section>

        <div className="min-w-0 space-y-5">
          <section className="overflow-hidden rounded-xl border border-pitch-700 bg-pitch-900">
            <header className="border-b border-pitch-700 bg-[#103a34] px-4 py-3">
              <h2 className="font-display text-base font-semibold text-chalk-50">All collectors on this match</h2>
            </header>
            {collaborators.length === 0 ? (
              <p className="px-4 py-5 text-sm text-chalk-200">No collectors are linked to this match.</p>
            ) : (
              <ul className="divide-y divide-pitch-800">
                {collaborators.map((c) => (
                  <li key={c.assignment_id ?? c.collector_id} className={"flex flex-wrap items-center justify-between gap-3 px-4 py-3 " + (c.assignment_id === assignment.id ? "bg-[#0d332e]" : "")}>
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-pitch-700 bg-pitch-800 text-[10px] font-semibold text-chalk-200">
                        {(c.full_name ?? "C").split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        {c.assignment_id ? (
                          <Link href={"/admin/assignments/" + c.assignment_id} className="break-words text-sm font-semibold text-chalk-50 underline decoration-pitch-500 underline-offset-2 hover:text-clock-amber">
                            {c.full_name ?? "Unnamed collector"}
                          </Link>
                        ) : <p className="text-sm font-semibold text-chalk-50">{c.full_name ?? "Unnamed collector"}</p>}
                        <p className="mt-1 text-xs text-chalk-200">{c.task} · {c.half}</p>
                        {c.assignment_id === assignment.id && <p className="mt-1 text-[10px] uppercase tracking-wider text-pitch-500">Current assignment</p>}
                      </div>
                    </div>
                    <span className={"shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold " + (c.status === "Completed" ? "bg-emerald-400/10 text-emerald-200" : "bg-pitch-800 text-chalk-200")}>{c.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-pitch-700 bg-pitch-900">
            <header className="border-b border-pitch-700 bg-[#103a34] px-4 py-3">
              <h2 className="font-display text-base font-semibold text-chalk-50">Activity History</h2>
            </header>
            {activityHistory.length === 0 ? (
              <p className="px-4 py-6 text-sm text-chalk-200">No activity history for this assignment.</p>
            ) : (
              <div className="max-h-[32rem] space-y-0 overflow-y-auto">
                {activityHistory.map((log) => (
                  <article key={log.id} className="relative border-b border-pitch-800 px-4 py-3 last:border-b-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-chalk-50">{log.actionLabel}</p>
                      <time className="text-[10px] text-chalk-200">{formatTimestamp(log.created_at)}</time>
                    </div>
                    <p className="mt-1 text-xs text-chalk-200">By {log.userName}</p>
                    <p className="mt-2 text-sm leading-5 text-chalk-50">{log.changeSummary}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

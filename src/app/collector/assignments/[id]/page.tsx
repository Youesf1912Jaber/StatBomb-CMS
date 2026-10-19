import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import { getAssignmentById, getAssignmentTaskTimers, getMatchCollaboratorsWithContacts } from "@/lib/assignments/queries";
import { distributionPresenceLabel } from "@/lib/assignments/distribution-presence";
import { getHyperCareForMatch } from "@/lib/hyper-care/lookup";
import { SlaCountdown } from "@/components/SlaCountdown";
import { AssignmentWorkControls } from "@/components/AssignmentWorkControls";
import { AssignmentTaskTracking } from "@/components/AssignmentTaskTracking";
import { BonusSubmissionForm } from "@/components/BonusSubmissionForm";
import { HyperCareSection } from "@/components/HyperCareSection";

function toWhatsAppNumber(phone: string) {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10 && digits.startsWith("1")) digits = "20" + digits;
  return digits;
}

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

export default async function AssignmentDetailsPage({ params }: { params: { id: string } }) {
  const profile = await getProfileOrRedirect();
  const supabase = createClient();
  const assignment = await getAssignmentById(supabase, params.id);
  if (!assignment) notFound();

  // RLS scopes this query to the signed-in collector (or an administrator).
  const collaborators = await getMatchCollaboratorsWithContacts(supabase, assignment.match_id);
  const others = collaborators.filter((c) => c.collector_id !== profile.id);
  const taskTimers = await getAssignmentTaskTimers(supabase, assignment.id);
  const hyperCare = await getHyperCareForMatch(assignment.match.home_team, assignment.match.away_team);

  return (
    <main className="match-details-page mx-auto w-full min-w-0 max-w-[1440px] space-y-5 pb-8">
      <header className="relative isolate overflow-hidden rounded-xl border border-pitch-700 bg-pitch-950/95 p-4 shadow-xl shadow-black/20 sm:p-6">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(115deg,rgba(5,45,39,0.96),rgba(3,28,26,0.88))]" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/collector" className="inline-flex items-center gap-2 text-xs text-chalk-200 transition hover:text-clock-amber">
            <span aria-hidden="true">←</span> Back to dashboard
          </Link>
          <span className={"inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold " + (assignment.status === "Completed" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : assignment.status === "Overdue" ? "border-rose-400/30 bg-rose-400/10 text-rose-200" : "border-clock-amber/30 bg-clock-amber/10 text-clock-amber")}>
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
          <span aria-hidden="true">♙</span> Match workspace · {assignment.match.external_id}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <AssignmentWorkControls
            assignmentId={assignment.id}
            status={assignment.status}
            hasActiveTaskTimer={taskTimers.some((timer) => timer.ended_at === null)}
          />
          {assignment.match.official_website_url && (
            <a href={assignment.match.official_website_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center rounded-md border border-pitch-700 bg-pitch-900 px-3.5 py-2 text-xs font-semibold text-chalk-50 transition hover:border-clock-amber">
              Open Official Match ↗
            </a>
          )}
        </div>
      </header>

      <HyperCareSection sections={hyperCare} />

      <section className="overflow-hidden rounded-xl border border-pitch-700 bg-pitch-900 shadow-lg shadow-black/10">
        <header className="border-b border-pitch-700 bg-[#103a34] px-4 py-3">
          <h2 className="font-display text-base font-semibold text-chalk-50">Match information</h2>
        </header>
        <dl className="grid grid-cols-1 gap-x-5 px-4 py-2 sm:grid-cols-2 sm:px-5 lg:grid-cols-3">
          <DetailField label="Match ID">{assignment.match.external_id}</DetailField>
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
        <div className="min-w-0 space-y-5">
          {assignment.status !== "Not Started" && (
            <section className="min-w-0 overflow-hidden rounded-xl border border-pitch-700 bg-pitch-900 p-3 sm:p-4">
              <AssignmentTaskTracking
                assignmentId={assignment.id}
                status={assignment.status}
                startedAt={assignment.started_at}
                timers={taskTimers}
              />
            </section>
          )}
          <BonusSubmissionForm assignmentId={assignment.id} />
        </div>

        <section className="min-w-0 overflow-hidden rounded-xl border border-pitch-700 bg-pitch-900">
          <header className="border-b border-pitch-700 bg-[#103a34] px-4 py-3">
            <h2 className="font-display text-base font-semibold text-chalk-50">All collectors on this match</h2>
          </header>
          {others.length === 0 ? (
            <p className="px-4 py-5 text-sm text-chalk-200">No other collectors assigned to this match.</p>
          ) : (
            <ul className="divide-y divide-pitch-800">
              {others.map((c) => {
                const whatsappNumber = c.phone ? toWhatsAppNumber(c.phone) : "";
                return (
                  <li key={c.assignment_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-pitch-700 bg-pitch-800 text-[10px] font-semibold text-chalk-200">
                        {(c.full_name ?? "C").split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-chalk-50">{c.full_name ?? "Unnamed collector"}</p>
                        <p className="mt-1 break-words text-xs text-chalk-200">HR-Code: {c.hr_code || "—"}</p>
                        <p className="mt-1 text-xs text-chalk-200">
                          Phone:{" "}
                          {whatsappNumber ? (
                            <a href={"https://wa.me/" + whatsappNumber} target="_blank" rel="noopener noreferrer"
                              className="font-medium text-clock-amber underline decoration-pitch-600 underline-offset-4 transition hover:text-chalk-50"
                              aria-label={"Message " + (c.full_name ?? "teammate") + " on WhatsApp"}>
                              {c.phone}
                            </a>
                          ) : c.phone || "—"}
                        </p>
                        <p className="mt-1 text-xs text-chalk-200">{c.task} · {c.half}</p>
                      </div>
                    </div>
                    <span className={"shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold " + (c.status === "Completed" ? "bg-emerald-400/10 text-emerald-200" : "bg-pitch-800 text-chalk-200")}>{c.status}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

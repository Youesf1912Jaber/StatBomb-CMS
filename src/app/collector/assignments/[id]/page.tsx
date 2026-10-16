import { notFound } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import { getAssignmentById, getAssignmentTaskTimers, getMatchCollaboratorsWithContacts } from "@/lib/assignments/queries";
import { getHyperCareForMatch } from "@/lib/hyper-care/lookup";
import { SlaCountdown } from "@/components/SlaCountdown";
import { AssignmentWorkControls } from "@/components/AssignmentWorkControls";
import { AssignmentTaskTracking } from "@/components/AssignmentTaskTracking";
import { BonusSubmissionForm } from "@/components/BonusSubmissionForm";
import { HyperCareSection } from "@/components/HyperCareSection";

function toWhatsAppNumber(phone: string) {
  // wa.me requires digits only, including the international country code.
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);

  // Collector roster mobile numbers are stored as Egyptian local numbers.
  if (digits.length === 10 && digits.startsWith("1")) digits = `20${digits}`;
  return digits;
}

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDateOnly(value: string | null): string {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
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

  const collaborators = await getMatchCollaboratorsWithContacts(supabase, assignment.match_id);
  const others = collaborators.filter((c) => c.collector_id !== profile.id);
  const taskTimers = await getAssignmentTaskTimers(supabase, assignment.id);
  const hyperCare = await getHyperCareForMatch(assignment.match.home_team, assignment.match.away_team);

  return (
    <div className="w-full max-w-none space-y-6">
      <section className="relative isolate min-h-[250px] overflow-hidden rounded-2xl border border-pitch-700 bg-[#021a19] shadow-xl shadow-black/15 sm:min-h-[290px]">
        <Image
          src="/images/football/locker-room-hero.webp"
          alt="The tunnel opening onto a football pitch"
          fill
          priority
          sizes="(max-width: 768px) 100vw, 1200px"
          className="object-cover object-center"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-[#021a19]/95 via-[#021a19]/70 to-[#021a19]/15" />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#021a19]/90 via-transparent to-[#021a19]/15" />
        <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-clock-amber via-pitch-500 to-transparent" />
        <div className="relative flex min-h-[250px] flex-col justify-end p-5 sm:min-h-[290px] sm:p-8">
          <div className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-black/30 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-white/85 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-clock-amber" />
            Match workspace · {assignment.match.competition ?? "Football"}
          </div>
          <h1 className="max-w-3xl font-display text-3xl leading-tight text-white sm:text-4xl lg:text-5xl">
            {assignment.match.home_team} <span className="text-clock-amber">vs</span> {assignment.match.away_team}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-white/85">
            <span className="rounded-md border border-white/20 bg-black/25 px-2.5 py-1.5">Match ID · {assignment.match.external_id}</span>
            <span className="rounded-md border border-white/20 bg-black/25 px-2.5 py-1.5">{formatDateOnly(assignment.match.match_date)}</span>
            <span className="rounded-md border border-white/20 bg-black/25 px-2.5 py-1.5">{assignment.half}</span>
            <span className="rounded-md border border-white/20 bg-black/25 px-2.5 py-1.5">{assignment.status}</span>
          </div>
        </div>
      </section>

      {assignment.match.official_website_url && (
        <a
          href={assignment.match.official_website_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-card border border-pitch-700 px-4 py-2 text-sm text-chalk-50 transition-colors hover:border-clock-amber"
        >
          Open Official Match
        </a>
      )}

      <dl className="grid grid-cols-1 gap-3 rounded-2xl border border-pitch-700 bg-pitch-950/90 p-4 shadow-lg shadow-black/10 sm:grid-cols-2 xl:grid-cols-4 sm:p-5">
        <div className="min-w-0 rounded-xl border border-pitch-700/80 bg-pitch-900/80 p-3.5">
          <dt className="text-xs font-medium uppercase tracking-wide text-chalk-300">Match ID</dt>
          <dd className="mt-1 break-words font-medium leading-5 text-chalk-50">{assignment.match.external_id}</dd>
        </div>
        <div className="min-w-0 rounded-xl border border-pitch-700/80 bg-pitch-900/80 p-3.5">
          <dt className="text-xs font-medium uppercase tracking-wide text-chalk-300">Task</dt>
          <dd className="mt-1 break-words font-medium leading-5 text-chalk-50">{assignment.task}</dd>
        </div>
        <div className="min-w-0 rounded-xl border border-pitch-700/80 bg-pitch-900/80 p-3.5">
          <dt className="text-xs font-medium uppercase tracking-wide text-chalk-300">Half</dt>
          <dd className="mt-1 break-words font-medium leading-5 text-chalk-50">{assignment.half}</dd>
        </div>
        <div className="min-w-0 rounded-xl border border-pitch-700/80 bg-pitch-900/80 p-3.5">
          <dt className="text-xs font-medium uppercase tracking-wide text-chalk-300">Status</dt>
          <dd className="mt-1 break-words font-medium leading-5 text-chalk-50">{assignment.status}</dd>
        </div>
        <div className="min-w-0 rounded-xl border border-pitch-700/80 bg-pitch-900/80 p-3.5">
          <dt className="text-xs font-medium uppercase tracking-wide text-chalk-300">Shift Date</dt>
          <dd className="mt-1 break-words font-medium leading-5 text-chalk-50">{formatDateOnly(assignment.shift_date)}</dd>
        </div>
        <div className="min-w-0 rounded-xl border border-pitch-700/80 bg-pitch-900/80 p-3.5">
          <dt className="text-xs font-medium uppercase tracking-wide text-chalk-300">SLA</dt>
          <dd className="mt-1 break-words font-medium leading-5">
            <SlaCountdown sla={assignment.sla} status={assignment.status} />
          </dd>
        </div>
        <div className="min-w-0 rounded-xl border border-pitch-700/80 bg-pitch-900/80 p-3.5">
          <dt className="text-xs font-medium uppercase tracking-wide text-chalk-300">Started</dt>
          <dd className="mt-1 break-words font-medium leading-5 text-chalk-50">{formatTimestamp(assignment.started_at)}</dd>
        </div>
        <div className="min-w-0 rounded-xl border border-pitch-700/80 bg-pitch-900/80 p-3.5">
          <dt className="text-xs font-medium uppercase tracking-wide text-chalk-300">Completed</dt>
          <dd className="mt-1 break-words font-medium leading-5 text-chalk-50">{formatTimestamp(assignment.completed_at)}</dd>
        </div>
      </dl>

      <HyperCareSection sections={hyperCare} />

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

      <BonusSubmissionForm assignmentId={assignment.id} />

      <div>
        <h2 className="font-display text-lg text-chalk-50">Teammates</h2>
        {others.length === 0 ? (
          <p className="mt-2 rounded-card border border-dashed border-pitch-700 px-4 py-6 text-center text-sm text-chalk-200">
            No other collectors assigned to this match.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-pitch-800 rounded-card border border-pitch-700">
            {others.map((c) => {
              const whatsappNumber = c.phone ? toWhatsAppNumber(c.phone) : "";
              return (
                <li key={c.assignment_id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="text-chalk-50">{c.full_name ?? "Unnamed collector"}</p>
                    <p className="mt-1 text-xs text-chalk-300">
                      HR-Code: {c.hr_code || "—"} · Phone:{" "}
                      {whatsappNumber ? (
                        <a
                          href={`https://wa.me/${whatsappNumber}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-clock-amber underline decoration-pitch-600 underline-offset-4 transition hover:text-chalk-50"
                          aria-label={`Message ${c.full_name ?? "teammate"} on WhatsApp`}
                        >
                          {c.phone}
                        </a>
                      ) : (
                        c.phone || "—"
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 text-right text-xs text-chalk-200">
                    {c.task} · {c.half} · {c.status}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

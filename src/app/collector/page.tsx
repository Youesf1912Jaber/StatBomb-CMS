import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import { isOperationalAssignment } from "@/lib/assignments/distribution-presence";
import { getAssignmentsForCollector } from "@/lib/assignments/queries";
import { getCairoToday, toCairoDateString } from "@/lib/dates";
import { SlaCountdown } from "@/components/SlaCountdown";
import { AssignmentTable } from "@/components/AssignmentTable";
import type { AssignmentWithMatch } from "@/lib/assignments/types";

function AssignmentCard({ a }: { a: AssignmentWithMatch }) {
  return (
    <Link
      href={`/collector/assignments/${a.id}`}
      className="block rounded-card border border-pitch-700 bg-pitch-900 px-4 py-3 transition-colors hover:border-clock-amber"
    >
      <p className="text-sm text-chalk-50">
        {a.match.home_team} vs {a.match.away_team}
      </p>
      <p className="mt-1 text-xs text-chalk-200">
        Task: {a.task} &nbsp;·&nbsp; Half: {a.half}
      </p>
      <p className="mt-1 text-xs text-chalk-300">
        {new Date(a.match.match_date).toLocaleDateString()} &nbsp;·&nbsp; {a.match.kickoff_time ? new Date(a.match.kickoff_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Kick-off —"}
      </p>
      <p className="mt-1 text-xs text-chalk-300">Status: {a.status}</p>
      <div className="mt-2">
        <SlaCountdown sla={a.sla} status={a.status} />
      </div>
    </Link>
  );
}

function Section({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: AssignmentWithMatch[];
  emptyLabel: string;
}) {
  return (
    <section>
      <h2 className="font-display text-lg text-chalk-50">
        {title} <span className="text-sm text-chalk-200">({items.length})</span>
      </h2>
      {items.length === 0 ? (
        <p className="mt-2 rounded-card border border-dashed border-pitch-700 px-4 py-6 text-center text-sm text-chalk-200">
          {emptyLabel}
        </p>
      ) : (
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((a) => (
            <AssignmentCard key={a.id} a={a} />
          ))}
        </div>
      )}
    </section>
  );
}

export default async function CollectorDashboardPage() {
  const profile = await getProfileOrRedirect();
  const firstName = (profile.full_name ?? profile.email).split(" ")[0];

  const supabase = createClient();
  const assignments = await getAssignmentsForCollector(supabase, profile.id);
  const today = getCairoToday();
  const currentAssignments = assignments.filter(isOperationalAssignment);

  // A) Today's Work — shift_date is the operational grouping, not match_date.
  const todaysWork = currentAssignments.filter((a) => a.shift_date === today);

  // B) Currently In Progress — regardless of shift/match date.
  const inProgress = currentAssignments.filter((a) => a.status === "In Progress");

  // C) Upcoming — Not Started, and either shift-dated in the future or
  // not-yet-shift-dated with a future-or-today match date.
  const upcoming = currentAssignments.filter((a) => {
    if (a.status !== "Not Started") return false;
    if (a.shift_date) return a.shift_date > today;
    return a.match.match_date >= today;
  });

  // D) Completed Today — by actual completion timestamp, in Cairo.
  const completedToday = assignments.filter(
    (a) => a.status === "Completed" && a.completed_at && toCairoDateString(a.completed_at) === today
  );

  // E) SLA Warnings / Overdue — computed live from the stored absolute SLA.
  // Phase 3 owns persisting an 'Overdue' status and firing the 30-minute
  // warning; until then this is a live comparison, not stored state.
  const nowMs = Date.now();
  const slaAttention = assignments.filter(
    (a) => a.status !== "Completed" && new Date(a.sla).getTime() <= nowMs
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl text-chalk-50">Welcome, {firstName}</h1>
        <p className="mt-1 text-sm text-chalk-200">Here&apos;s what&apos;s on your plate.</p>
      </div>

      <Section title="Today's Work" items={todaysWork} emptyLabel="Nothing shift-dated for today." />
      <Section title="Currently In Progress" items={inProgress} emptyLabel="Nothing in progress right now." />
      <Section title="Upcoming Assignments" items={upcoming} emptyLabel="No upcoming assignments." />
      <Section title="Completed Today" items={completedToday} emptyLabel="Nothing completed yet today." />
      <Section title="SLA Warnings / Overdue" items={slaAttention} emptyLabel="Nothing overdue." />

      <section>
        <h2 className="font-display text-lg text-chalk-50">All Assignments</h2>
        <p className="mb-2 text-sm text-chalk-200">
          Search or filter anything not covered above, including past matches.
        </p>
        <AssignmentTable assignments={assignments} detailsBasePath="/collector/assignments" />
      </section>
    </div>
  );
}

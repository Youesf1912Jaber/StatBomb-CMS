import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import {
  isCurrentDistributionAssignment,
  isOperationalAssignment,
} from "@/lib/assignments/distribution-presence";
import { getAssignmentsForCollector } from "@/lib/assignments/queries";
import {
  getCairoToday,
  isCurrentShiftDate,
  isOnOrAfterCalendarDate,
  isUpcomingShiftDate,
  toCairoDateString,
} from "@/lib/dates";
import { SlaCountdown } from "@/components/SlaCountdown";
import { AssignmentTable } from "@/components/AssignmentTable";
import type { AssignmentWithMatch } from "@/lib/assignments/types";

function AssignmentCard({ a }: { a: AssignmentWithMatch }) {
  const halfNumber = a.half.match(/\d+/)?.[0] ?? "—";
  const statusTone =
    a.status === "Completed"
      ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
      : a.status === "In Progress"
        ? "border-sky-300/30 bg-sky-300/10 text-sky-100"
        : a.status === "Overdue"
          ? "border-red-300/30 bg-red-300/10 text-red-100"
          : "border-chalk-200/20 bg-pitch-950/40 text-chalk-100";

  return (
    <Link
      href={`/collector/assignments/${a.id}`}
      className="group relative isolate flex min-h-[228px] flex-col overflow-hidden rounded-xl border border-pitch-700 bg-gradient-to-br from-pitch-800 via-pitch-900 to-pitch-950 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-clock-amber hover:shadow-xl hover:shadow-black/15"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 opacity-70">
        <div className="absolute right-0 top-0 h-full w-24 border-l border-white/[0.06] bg-gradient-to-l from-white/[0.035] to-transparent" />
        <div className="absolute right-5 top-16 h-14 w-1 rounded-full bg-clock-amber/45 shadow-[0_0_15px_rgba(218,186,105,0.16)]" />
        <div className="absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r from-clock-amber/70 via-pitch-500/60 to-transparent opacity-70" />
      </div>
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-chalk-200">Matchday locker</span>
        <span className={`rounded-full border px-2 py-1 text-[10px] font-medium leading-none ${statusTone}`}>{a.status}</span>
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute right-8 top-10 font-mono text-6xl font-semibold leading-none text-white/[0.07]">{halfNumber.padStart(2, "0")}</div>
      <h3 className="relative mt-5 max-w-[88%] text-base font-semibold leading-snug text-chalk-50 transition-colors group-hover:text-clock-amber">
        {a.match.home_team} <span className="text-chalk-200">vs</span> {a.match.away_team}
      </h3>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-chalk-200">
        <span className="rounded-md border border-pitch-600/60 bg-pitch-950/40 px-2 py-1">{a.half}</span>
        <span className="rounded-md border border-pitch-600/60 bg-pitch-950/40 px-2 py-1">{a.task}</span>
      </div>
      <div className="mt-auto pt-4">
        <div className="flex items-center justify-between gap-3 border-t border-white/[0.08] pt-3 text-xs text-chalk-200">
          <span>Match ID <strong className="ml-1 font-mono text-chalk-50">{a.match.external_id}</strong></span>
          <span className="text-right">
            {a.match.kickoff_time
              ? new Date(a.match.kickoff_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : "Kick-off —"}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-chalk-200">
          <span>{new Date(a.match.match_date).toLocaleDateString()}</span>
          <span className="text-right font-medium text-clock-amber transition-transform group-hover:translate-x-0.5">Open assignment →</span>
        </div>
        <div className="mt-2"><SlaCountdown sla={a.sla} status={a.status} /></div>
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
        {title}{" "}
        <span className="text-sm text-chalk-200">({items.length})</span>
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
  const currentDistribution = assignments.filter(
    isCurrentDistributionAssignment
  );

  // A) Today's Work — shift_date is the operational grouping, not match_date.
  const todaysWork = currentAssignments.filter(
    (a) => isCurrentShiftDate(a.shift_date, today)
  );

  // Show all not-started assignments still present in the current Distribution,
  // including rows assigned on previous shifts. Otherwise collectors can see
  // the rows only in the long table while today's/upcoming cards remain empty.
  const notStartedAssignments = currentDistribution.filter(
    (a) => a.status === "Not Started"
  );

  // B) Currently In Progress — regardless of shift/match date.
  const inProgress = currentAssignments.filter(
    (a) => a.status === "In Progress"
  );

  // C) Upcoming — Not Started, and either shift-dated in the future or
  // not-yet-shift-dated with a future-or-today match date.
  const upcoming = currentAssignments.filter((a) => {
    if (a.status !== "Not Started") return false;
    if (a.shift_date) return isUpcomingShiftDate(a.shift_date, today);
    return isOnOrAfterCalendarDate(a.match.match_date, today);
  });

  // D) Completed Today — by actual completion timestamp, in Cairo.
  const completedToday = assignments.filter(
    (a) =>
      a.status === "Completed" &&
      a.completed_at &&
      toCairoDateString(a.completed_at) === today
  );

  // E) SLA Warnings / Overdue — computed live from the stored absolute SLA.
  // Phase 3 owns persisting an 'Overdue' status and firing the 30-minute
  // warning; until then this is a live comparison, not stored state.
  const nowMs = Date.now();

  const slaAttention = assignments.filter(
    (a) =>
      a.status !== "Completed" &&
      new Date(a.sla).getTime() <= nowMs
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl text-chalk-50">
          Welcome, {firstName}
        </h1>

        <p className="mt-1 text-sm text-chalk-200">
          Here&apos;s what&apos;s on your plate.
        </p>
      </div>

      <Section
        title="Today's Work"
        items={todaysWork}
        emptyLabel="Nothing shift-dated for today."
      />

      <Section
        title="Not Started (All Shifts)"
        items={notStartedAssignments}
        emptyLabel="No not-started assignments in your current distribution."
      />

      <Section
        title="Currently In Progress"
        items={inProgress}
        emptyLabel="Nothing in progress right now."
      />

      <Section
        title="Upcoming Assignments"
        items={upcoming}
        emptyLabel="No upcoming assignments."
      />

      <Section
        title="Completed Today"
        items={completedToday}
        emptyLabel="Nothing completed yet today."
      />

      <Section
        title="SLA Warnings / Overdue"
        items={slaAttention}
        emptyLabel="Nothing overdue."
      />

      <section>
        <h2 className="font-display text-lg text-chalk-50">
          Current Distribution
        </h2>

        <p className="mb-2 text-sm text-chalk-200">
          {currentDistribution.length} assignment
          {currentDistribution.length === 1 ? "" : "s"} currently distributed
          to you, including previous shifts.
        </p>

        {currentDistribution.length === 0 ? (
          <p className="rounded-card border border-dashed border-pitch-700 px-4 py-6 text-center text-sm text-chalk-200">
            Nothing currently distributed to you.
          </p>
        ) : (
          <AssignmentTable
            assignments={currentDistribution}
            detailsBasePath="/collector/assignments"
            liveRefresh
            realtimeRefresh={false}
          />
        )}
      </section>

      <section>
        <h2 className="font-display text-lg text-chalk-50">
          All Assignments
        </h2>

        <p className="mb-2 text-sm text-chalk-200">
          Search or filter anything not covered above, including past matches.
        </p>

        <AssignmentTable
          assignments={assignments}
          detailsBasePath="/collector/assignments"
        />
      </section>
    </div>
  );
}

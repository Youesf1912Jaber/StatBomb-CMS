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

const MATCH_CARD_PHOTOS = [
  {
    src: "https://images.unsplash.com/photo-1574561937874-23dd3e64dc89?auto=format&fit=crop&w=1000&q=80",
    alt: "Aerial view of a football stadium and pitch",
    label: "STADIUM VIEW",
  },
  {
    src: "https://images.unsplash.com/photo-1665413812017-3cd85b51d0a4?auto=format&fit=crop&w=1000&q=80",
    alt: "Football match atmosphere at the stadium",
    label: "MATCH ACTION",
  },
  {
    src: "https://images.unsplash.com/photo-1782603983074-a90e315475fd?auto=format&fit=crop&w=1000&q=80",
    alt: "Goalkeeper diving to make a save during a football match",
    label: "GOALKEEPER",
  },
  {
    src: "https://images.unsplash.com/photo-1590701722430-6a9751ff65d1?auto=format&fit=crop&w=1000&q=80",
    alt: "Football players contesting the ball on the pitch",
    label: "ON THE PITCH",
  },
  {
    src: "https://images.unsplash.com/photo-1592841897941-5766f3c49288?auto=format&fit=crop&w=1000&q=80",
    alt: "Aerial view of a football stadium",
    label: "GROUND OVERVIEW",
  },
] as const;

function AssignmentCard({ a }: { a: AssignmentWithMatch }) {
  const halfNumber = a.half.match(/\d+/)?.[0] ?? (a.half === "Full Match" ? "FM" : "00");
  const photoSeed = String(a.match.external_id ?? a.id)
    .split("")
    .reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const matchPhoto = MATCH_CARD_PHOTOS[photoSeed % MATCH_CARD_PHOTOS.length];
  const statusTone =
    a.status === "Completed"
      ? "border-emerald-300/30 bg-emerald-300/10 text-chalk-50"
      : a.status === "In Progress"
        ? "border-sky-300/30 bg-sky-300/10 text-chalk-50"
        : a.status === "Overdue"
          ? "border-red-300/30 bg-red-300/10 text-chalk-50"
          : "border-chalk-200/20 bg-pitch-950/40 text-chalk-100";

  return (
    <Link
      href={`/collector/assignments/${a.id}`}
      className="group relative isolate flex min-h-[322px] flex-col overflow-hidden rounded-xl border border-pitch-700 bg-gradient-to-br from-pitch-800 via-pitch-900 to-pitch-950 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-clock-amber hover:shadow-xl hover:shadow-black/15"
    >
      <div className="relative -mx-4 -mt-4 mb-4 h-32 overflow-hidden border-b border-white/10 bg-pitch-950">
        <img
          src={matchPhoto.src}
          alt={matchPhoto.alt}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#021A19]/90 via-[#021A19]/15 to-[#021A19]/10" />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-[#021A19]/45 via-transparent to-transparent" />
        <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/90">{matchPhoto.label}</span>
          <span className="rounded-full border border-white/25 bg-black/30 px-2 py-1 text-[9px] uppercase tracking-wide text-white/85 backdrop-blur-sm">Photo · Unsplash</span>
        </div>
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

  const matchdayStats = [
    { label: "Today’s work", value: todaysWork.length, note: "Shift assignments" },
    { label: "In progress", value: inProgress.length, note: "On the pitch now" },
    { label: "Completed today", value: completedToday.length, note: "Full-time" },
    { label: "SLA attention", value: slaAttention.length, note: "Needs attention" },
  ];

  return (
    <div className="space-y-8">
      <section className="relative isolate overflow-hidden rounded-2xl border border-pitch-700 bg-[#032927] shadow-2xl shadow-black/10">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-20 bg-cover bg-center"
          style={{
            backgroundImage: 'url("https://images.pexels.com/photos/30689707/pexels-photo-30689707.jpeg?auto=compress&cs=tinysrgb&w=1800")',
          }}
        />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-r from-[#021A19] via-[#021A19]/90 to-[#021A19]/35" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-[#021A19]/90 via-transparent to-[#021A19]/10" />
        <div aria-hidden="true" className="absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r from-[#E8C977] via-[#3A8B7A] to-transparent" />

        <div className="grid gap-7 p-5 sm:p-7 md:grid-cols-[minmax(0,1fr)_220px] md:items-end md:p-9">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-[#021A19]/70 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-chalk-100 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-[#E8C977] shadow-[0_0_10px_rgba(218,186,105,0.9)]" />
              Arqam Football Operations · Matchday
            </div>
            <h1 className="mt-5 font-display text-3xl leading-tight text-white sm:text-4xl lg:text-5xl">
              Welcome to your
              <span className="block text-[#E8C977]">locker room, {firstName}.</span>
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-white/85 sm:text-base">
              Your shift. Your matches. Your next play.
              Everything you need to get matchday work done is right here.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a href="#locker-room" className="inline-flex items-center gap-2 rounded-lg bg-[#E8C977] px-4 py-2.5 text-sm font-semibold text-[#052221] transition hover:brightness-105">
                Open my lockers <span aria-hidden="true">↓</span>
              </a>
              <span className="text-xs text-white/75">Matchday · {today}</span>
            </div>
            <a
              href="https://www.pexels.com/photo/inside-a-professional-football-locker-room-30689707/"
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-block text-[10px] text-white/55 underline decoration-white/25 underline-offset-2 hover:text-white/85"
            >
              Locker-room photo · Pexels
            </a>
          </div>

          <div className="rounded-xl border border-white/20 bg-[#021A19]/75 p-4 text-white shadow-xl backdrop-blur-md sm:max-w-xs md:justify-self-end">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-chalk-200">Your shift board</p>
            <p className="mt-3 font-display text-3xl">{currentAssignments.filter((a) => a.status !== "Completed").length}</p>
            <p className="mt-1 text-sm text-chalk-100">active assignments</p>
            <div className="mt-4 flex items-center justify-between border-t border-white/15 pt-3 text-xs text-chalk-200">
              <span>Currently in progress</span>
              <strong className="font-mono text-[#E8C977]">{inProgress.length}</strong>
            </div>
          </div>
        </div>
      </section>

      <section aria-label="Matchday overview" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {matchdayStats.map((stat, index) => (
          <div key={stat.label} className="relative overflow-hidden rounded-xl border border-pitch-700 bg-pitch-900/85 p-4">
            <div aria-hidden="true" className={index === 3 ? "absolute inset-y-0 left-0 w-1 bg-clock-red" : index === 1 ? "absolute inset-y-0 left-0 w-1 bg-sky-400" : "absolute inset-y-0 left-0 w-1 bg-clock-amber"} />
            <p className="pl-2 text-xs text-chalk-200">{stat.label}</p>
            <p className="pl-2 pt-2 font-mono text-3xl font-semibold tracking-tight text-chalk-50">{stat.value}</p>
            <p className="pl-2 pt-1 text-[11px] text-chalk-200">{stat.note}</p>
          </div>
        ))}
      </section>

      <div id="locker-room" className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-pitch-500">The squad room</p>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-2xl text-chalk-50">Your matchday lockers</h2>
            <p className="mt-1 text-sm text-chalk-200">Every card is one of your real assignments. Open a locker to see details and start work.</p>
          </div>
          <span className="rounded-full border border-pitch-700 bg-pitch-900/75 px-3 py-1.5 font-mono text-xs text-chalk-100">{currentDistribution.length} assigned</span>
        </div>
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

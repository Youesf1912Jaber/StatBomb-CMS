import Link from "next/link";
import Image from "next/image";
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
import { CollectorShiftDatePicker } from "./CollectorShiftDatePicker";
import type { AssignmentWithMatch } from "@/lib/assignments/types";

const MATCH_CARD_PHOTOS = [
  {
    src: "/images/football/stadium-wide.jpg",
    alt: "Wide view of a football stadium and pitch",
    label: "STADIUM VIEW",
  },
  {
    src: "/images/football/match-action-1.jpg",
    alt: "Football action on the pitch",
    label: "MATCH ACTION",
  },
  {
  src: "/images/football/messi-goat.jpg",
  alt: "Lionel Messi, widely celebrated as the greatest of all time",
  label: "MESSI IS THE GOAT",
},
  {
    src: "/images/football/goalkeeper-save.jpg",
    alt: "Goalkeeper making a save",
    label: "GOALKEEPER",
  },
  {
    src: "/images/football/match-action-2.jpg",
    alt: "Football players contesting the ball",
    label: "ON THE PITCH",
  },
  {
    src: "/images/football/team-celebration.jpg",
    alt: "Football team celebrating together",
    label: "TEAM MOMENT",
  },
] as const;

const DEFAULT_MATCH_CARD_PHOTO = MATCH_CARD_PHOTOS[0]!;

function getMatchPhotoIndex(assignment: AssignmentWithMatch): number {
  // Stable per assignment, rather than restarting at photo 0 in every section.
  // This way different matches can use different imagery across shifts and sections.
  const identity = assignment.id || assignment.match.external_id;
  let hash = 0;
  for (let index = 0; index < identity.length; index += 1) {
    hash = (hash * 31 + identity.charCodeAt(index)) >>> 0;
  }
  return hash % MATCH_CARD_PHOTOS.length;
}

function AssignmentCard({ a, cardNumber }: { a: AssignmentWithMatch; cardNumber: number }) {
  const matchPhoto = MATCH_CARD_PHOTOS[getMatchPhotoIndex(a)] ?? DEFAULT_MATCH_CARD_PHOTO;
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
      <div className="relative -mx-4 -mt-4 mb-4 h-44 overflow-hidden border-b border-white/10 bg-pitch-950 sm:h-48">
        <Image
          src={matchPhoto.src}
          alt={matchPhoto.alt}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
          className="object-cover object-center transition-transform duration-700 group-hover:scale-105"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#021A19]/55 via-[#021A19]/5 to-transparent" />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-[#021A19]/15 via-transparent to-transparent" />
        <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/90">{matchPhoto.label}</span>
          
        </div>
      </div>
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-chalk-200">Matchday locker</span>
        <span className={`rounded-full border px-2 py-1 text-[10px] font-medium leading-none ${statusTone}`}>{a.status}</span>
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute right-3 top-3 z-10 flex h-14 min-w-14 items-center justify-center rounded-xl border border-[#E8C977]/60 bg-[#021A19]/90 px-3 font-mono text-3xl font-bold leading-none text-[#F2D37C] shadow-lg shadow-black/40 ring-1 ring-black/20">{String(cardNumber).padStart(2, "0")}</div>
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
          <span>{(a.shift_date ?? a.match.match_date)
              ? new Date(`${a.shift_date ?? a.match.match_date}T12:00:00`).toLocaleDateString()
              : "Shift date —"}</span>
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
          {(() => {
            const ordered = [...items].sort((left, right) => {
              const shiftOrder = (left.shift_date ?? "9999-99-99").localeCompare(right.shift_date ?? "9999-99-99");
              if (shiftOrder !== 0) return shiftOrder;
              return left.created_at.localeCompare(right.created_at);
            });
            const sequenceByShift = new Map<string, number>();
            return ordered.map((a, index) => {
              const shiftKey = a.shift_date ?? "no-shift-date";
              const cardNumber = (sequenceByShift.get(shiftKey) ?? 0) + 1;
              sequenceByShift.set(shiftKey, cardNumber);
              return <AssignmentCard key={a.id} a={a} cardNumber={cardNumber} />;
            });
          })()}
        </div>
      )}
    </section>
  );
}

export default async function CollectorDashboardPage({
  searchParams,
}: {
  searchParams?: { shiftDate?: string };
}) {
  const profile = await getProfileOrRedirect();
  const firstName = (profile.full_name ?? profile.email).split(" ")[0];

  const supabase = createClient();
  const assignments = await getAssignmentsForCollector(supabase, profile.id);
  const today = getCairoToday();
  const requestedShiftDate = searchParams?.shiftDate ?? "";
  const isValidShiftDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedShiftDate)
    && !Number.isNaN(Date.parse(requestedShiftDate))
    && new Date(requestedShiftDate).toISOString().slice(0, 10) === requestedShiftDate;
  const selectedShiftDate = isValidShiftDate ? requestedShiftDate : today;

  const currentAssignments = assignments.filter(isOperationalAssignment);
  const currentDistribution = assignments.filter(
    isCurrentDistributionAssignment
  );

  // A) Selected Shift Work — use shift_date (not match_date), matching admin behavior.
  const selectedShiftWork = currentAssignments.filter(
    (a) => isCurrentShiftDate(a.shift_date, selectedShiftDate)
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
    { label: "Selected shift work", value: selectedShiftWork.length, note: "Assignments for selected shift" },
    { label: "In progress", value: inProgress.length, note: "On the pitch now" },
    { label: "Completed today", value: completedToday.length, note: "Full-time" },
    { label: "SLA attention", value: slaAttention.length, note: "Needs attention" },
  ];

  return (
    <div className="relative isolate -mx-3 space-y-8 overflow-hidden rounded-2xl px-3 py-3 sm:-mx-5 sm:px-5 sm:py-5 lg:-mx-6 lg:px-6">
<div
  aria-hidden="true"
  className="pointer-events-none fixed inset-0 -z-20 bg-cover bg-center bg-no-repeat"
  style={{
    backgroundImage: 'url("/images/football/pitch-background-dark.webp")',
  }}
/>

{/* Main dark overlay */}
<div
  aria-hidden="true"
  className="pointer-events-none fixed inset-0 -z-10 bg-[#021A19]/50"
/>

{/* Cinematic gradient overlay */}
<div
  aria-hidden="true"
  className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-b from-[#021A19]/30 via-[#021A19]/45 to-[#021A19]/65"
/>
      <section className="relative isolate overflow-hidden rounded-2xl border border-pitch-700 bg-[#032927]/85 shadow-2xl shadow-black/10 backdrop-blur-[2px]">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-20 bg-cover bg-center"
          style={{
            backgroundImage: 'url("/images/football/tactics-background.jpg")',
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
              <span className="text-xs text-white/75">Shift · {selectedShiftDate}</span>
              <CollectorShiftDatePicker selectedDate={selectedShiftDate} />
            </div>
            <p className="mt-5 text-[10px] text-white/55">
              Football visuals are stored locally with the app.
            </p>
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
        {matchdayStats.map((stat, index) => {
          const href = index === 0
            ? "#collector-todays-work"
            : index === 1
              ? "#collector-in-progress"
              : index === 2
                ? "#collector-completed-today"
                : "#collector-sla-attention";

          return (
            <a
              key={stat.label}
              href={href}
              aria-label={`${stat.label}: ${stat.value}. ${stat.note}. Scroll to matching assignments.`}
              className="group relative block min-w-0 overflow-hidden rounded-xl border border-pitch-700 bg-pitch-900/85 p-4 text-left shadow-lg shadow-black/10 transition duration-200 hover:-translate-y-0.5 hover:border-pitch-500 hover:bg-pitch-800/90 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clock-amber focus-visible:ring-offset-2 focus-visible:ring-offset-pitch-950 active:translate-y-0"
            >
              <div aria-hidden="true" className={index === 3 ? "absolute inset-y-0 left-0 w-1 bg-clock-red" : index === 1 ? "absolute inset-y-0 left-0 w-1 bg-sky-400" : "absolute inset-y-0 left-0 w-1 bg-clock-amber"} />
              <span aria-hidden="true" className="absolute right-3 top-3 text-sm text-chalk-200/60 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-clock-amber">↘</span>
              <p className="pl-2 pr-5 text-xs text-chalk-200">{stat.label}</p>
              <p className="pl-2 pt-2 font-mono text-3xl font-semibold tracking-tight text-chalk-50">{stat.value.toLocaleString()}</p>
              <p className="pl-2 pt-1 text-[11px] text-chalk-200">{stat.note}</p>
            </a>
          );
        })}
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

      <div id="collector-todays-work" className="scroll-mt-24">
      <Section
        title={selectedShiftDate === today ? "Today's Work" : `Shift Work · ${selectedShiftDate}`}
        items={selectedShiftWork}
        emptyLabel={`No assignments scheduled for shift date ${selectedShiftDate}.`}
      />
      </div>

      <Section
        title="Not Started (All Shifts)"
        items={notStartedAssignments}
        emptyLabel="No not-started assignments in your current distribution."
      />

      <div id="collector-in-progress" className="scroll-mt-24">
      <Section
        title="Currently In Progress"
        items={inProgress}
        emptyLabel="Nothing in progress right now."
      />
      </div>

      <Section
        title="Upcoming Assignments"
        items={upcoming}
        emptyLabel="No upcoming assignments."
      />

      <div id="collector-completed-today" className="scroll-mt-24">
      <Section
        title="Completed Today"
        items={completedToday}
        emptyLabel="Nothing completed yet today."
      />
      </div>

      <div id="collector-sla-attention" className="scroll-mt-24">
      <Section
        title="SLA Warnings / Overdue"
        items={slaAttention}
        emptyLabel="Nothing overdue."
      />
      </div>

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

import { createClient } from "@/lib/supabase/server";
import { getAdminDashboardAssignmentsForShift } from "@/lib/assignments/queries";
import { AdminHistoricalMatchSearch } from "@/components/AdminHistoricalMatchSearch";
import { AssignmentTable } from "@/components/AssignmentTable";
import { getCairoToday, isCurrentShiftDate } from "@/lib/dates";
import { AdminBulkCompleteButton } from "./AdminBulkCompleteButton";
import { RefreshDistributionButton } from "./RefreshDistributionButton";
import { ShiftDatePicker } from "./ShiftDatePicker";

export const runtime = "nodejs";

const CURRENT_SHIFT_STATUS_ORDER = ["Completed", "In Progress", "Overdue", "Not Started"] as const;
const CURRENT_SHIFT_SECTION_LABELS = {
  Completed: "Completed",
  "In Progress": "In Progress",
  Overdue: "Overdue / SLA Broken",
  "Not Started": "Not Started (All Shifts)",
} as const;

function SummaryCard({ label, value, note, accent, href }: { label: string; value: number; note: string; accent: string; href: string }) {
  return (
    <a
      href={href}
      aria-label={`${label}: ${value.toLocaleString()}. ${note}. Jump to matching assignments.`}
      className="group relative block min-w-0 overflow-hidden rounded-xl border border-pitch-700 bg-pitch-950/90 p-4 text-left shadow-lg shadow-black/10 transition duration-200 hover:-translate-y-0.5 hover:border-pitch-500 hover:bg-pitch-900/90 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clock-amber focus-visible:ring-offset-2 focus-visible:ring-offset-pitch-950 active:translate-y-0 sm:p-5"
    >
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${accent}`} />
      <span aria-hidden="true" className="absolute right-3 top-3 text-sm text-chalk-200/60 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-clock-amber">↗</span>
      <p className="pr-5 text-xs font-medium text-chalk-200">{label}</p>
      <p className="mt-2 font-display text-3xl font-bold tabular-nums text-chalk-50">{value.toLocaleString()}</p>
      <p className="mt-1 text-xs text-chalk-200">{note}</p>
    </a>
  );
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams?: { shiftDate?: string };
}) {
  const today = getCairoToday();
  const requestedShiftDate = searchParams?.shiftDate ?? "";
  const isValidShiftDate = /^\\d{4}-\\d{2}-\\d{2}$/.test(requestedShiftDate)
    && !Number.isNaN(Date.parse(requestedShiftDate))
    && new Date(requestedShiftDate).toISOString().slice(0, 10) === requestedShiftDate;
  const currentShiftDate = isValidShiftDate ? requestedShiftDate : today;
  const supabase = createClient();
  const assignments = await getAdminDashboardAssignmentsForShift(supabase, currentShiftDate);
  const currentShiftAssignments = assignments.filter(
    (assignment) => isCurrentShiftDate(assignment.shift_date, currentShiftDate)
  );
  const allDistributedAssignments = assignments;
  const bulkCompletionCount = allDistributedAssignments.filter(
    (assignment) => assignment.status !== "Completed"
  ).length;

  const collectorIds = [...new Set(assignments.map((a) => a.collector_id))];
  const collectorNames: Record<string, string> = {};
  if (collectorIds.length > 0) {
    const { data: collectors } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", collectorIds);
    for (const c of collectors ?? []) {
      collectorNames[c.id] = c.full_name ?? c.email;
    }
  }

  const inProgressCount = assignments.filter((a) => a.status === "In Progress").length;
  const completedCount = assignments.filter((a) => a.status === "Completed").length;
  const overdueCount = assignments.filter((a) => a.status === "Overdue").length;
  const notStartedCount = assignments.filter((a) => a.status === "Not Started").length;

  return (
    <div className="relative isolate min-w-0 space-y-6 sm:space-y-8">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-20 bg-cover bg-center opacity-20" style={{ backgroundImage: 'url("/images/football/pitch-background-tactical.webp")' }} />
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(180deg,rgba(1,22,20,0.68)_0%,rgba(1,22,20,0.88)_45%,rgba(1,22,20,0.96)_100%)]" />
      <section className="relative isolate overflow-hidden rounded-2xl border border-pitch-700 bg-pitch-950 shadow-xl shadow-black/20">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-20 bg-cover bg-center"
          style={{ backgroundImage: 'url("/images/football/tactics-background.jpg")' }}
        />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,rgba(2,20,19,0.97)_0%,rgba(2,25,23,0.91)_52%,rgba(2,20,19,0.56)_100%)]" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_85%_20%,rgba(218,186,105,0.16),transparent_38%)]" />
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-end lg:p-9">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/25 px-3 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-chalk-100 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-clock-amber" />
              Arqam Football Operations · Tactical Control
            </span>
            <p className="mt-5 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-clock-amber">Admin matchday command</p>
            <h1 className="mt-2 max-w-3xl font-display text-3xl leading-tight text-white sm:text-4xl lg:text-5xl">
              Matchday <span className="text-clock-amber">control room.</span>
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/80 sm:text-base">
              Monitor every assignment, track collector progress, and keep the whole matchday moving from one tactical overview.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <RefreshDistributionButton />
              <AdminBulkCompleteButton eligibleCount={bulkCompletionCount} />
              <ShiftDatePicker selectedDate={currentShiftDate} />
            </div>
          </div>
          <aside className="rounded-xl border border-clock-amber/35 bg-[#031c1a]/90 p-5 backdrop-blur-sm">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-chalk-200">Assignments board</p>
            <p className="mt-3 font-display text-4xl font-bold tabular-nums text-white">{assignments.length.toLocaleString()}</p>
            <p className="mt-1 text-sm text-chalk-100">total assignments</p>
            <div className="mt-4 flex items-center justify-between border-t border-white/15 pt-3 text-xs">
              <span className="text-chalk-200">Current-shift items</span>
              <span className="font-semibold text-clock-amber">{currentShiftAssignments.length.toLocaleString()}</span>
            </div>
          </aside>
        </div>
        <div className="h-1 bg-gradient-to-r from-clock-amber via-pitch-500 to-transparent" />
      </section>

      <section aria-label="Assignment overview" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <SummaryCard label="Current & active" value={assignments.length} note="Selected shift and active work" accent="bg-clock-amber" href="#all-distributed-matches" />
        <SummaryCard label="In progress" value={inProgressCount} note="Collectors currently working" accent="bg-sky-400" href="#status-in-progress" />
        <SummaryCard label="Completed" value={completedCount} note="Finished assignments" accent="bg-emerald-400" href="#status-completed" />
        <SummaryCard
          label="Needs attention"
          value={overdueCount}
          note={`${notStartedCount.toLocaleString()} not started`}
          accent="bg-clock-red"
          href={overdueCount > 0 ? "#status-overdue" : "#status-not-started"}
        />
      </section>

      <section className="space-y-5 rounded-2xl border border-pitch-700/70 bg-pitch-950/45 p-3 shadow-xl shadow-black/10 backdrop-blur-sm sm:p-5">
        <div className="flex flex-col gap-3 border-b border-pitch-700 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-clock-amber">Live operations · Shift control</p>
            <h2 className="mt-1 font-display text-2xl text-chalk-50 sm:text-3xl">Current Shift</h2>
            <p className="mt-1 text-sm text-chalk-200">Assignments scheduled for {currentShiftDate}.</p>
          </div>
          <span className="inline-flex w-fit items-center rounded-full border border-clock-amber/30 bg-[#082b27] px-3 py-2 text-xs font-semibold tabular-nums text-chalk-100 shadow-sm">
            {currentShiftAssignments.length.toLocaleString()} scheduled today
          </span>
        </div>
        {CURRENT_SHIFT_STATUS_ORDER.map((status) => {
          const statusAssignments = currentShiftAssignments.filter((assignment) => assignment.status === status);

          return (
            <section
              key={status}
              id={status === "Completed" ? "status-completed" : status === "In Progress" ? "status-in-progress" : status === "Overdue" ? "status-overdue" : "status-not-started"}
              className="min-w-0 scroll-mt-24 overflow-hidden rounded-xl border border-pitch-600/80 bg-[#031e1c]/90 shadow-lg shadow-black/10"
            >
              <div className="flex items-center justify-between gap-3 border-b border-pitch-700 bg-gradient-to-r from-pitch-800/90 to-pitch-900/70 px-4 py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span aria-hidden="true" className={`h-8 w-1 shrink-0 rounded-full ${status === "Completed" ? "bg-emerald-400" : status === "In Progress" ? "bg-sky-400" : status === "Overdue" ? "bg-clock-red" : "bg-clock-amber"}`} />
                  <h3 className="font-display text-base font-semibold text-chalk-50 sm:text-lg">{CURRENT_SHIFT_SECTION_LABELS[status]}</h3>
                </div>
                <span className={`shrink-0 rounded-lg border px-3 py-1.5 text-sm font-bold tabular-nums ${status === "Completed" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : status === "In Progress" ? "border-sky-400/30 bg-sky-400/10 text-sky-200" : status === "Overdue" ? "border-clock-red/30 bg-clock-red/10 text-red-200" : "border-clock-amber/30 bg-clock-amber/10 text-clock-amber"}`}>{statusAssignments.length.toLocaleString()}</span>
              </div>
              <div className="p-2 sm:p-3">
                <AssignmentTable
                  assignments={statusAssignments}
                  detailsBasePath="/admin/assignments"
                  showCollector
                  collectorNames={collectorNames}
                  showFilters={false}
                  realtimeRefresh={false}
                />
              </div>
            </section>
          );
        })}
      </section>

      <section id="all-distributed-matches" className="min-w-0 scroll-mt-24 space-y-3">
        <div className="flex flex-col gap-2 border-b border-pitch-700 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-clock-amber">Live assignment register</p>
            <h2 className="mt-1 font-display text-2xl text-chalk-50">Current & Active Assignments</h2>
            <p className="mt-1 text-sm text-chalk-200">This view loads the selected shift and unfinished work. Use the archive search below for older matches.</p>
          </div>
          <span className="w-fit rounded-full border border-pitch-700 bg-pitch-950/80 px-3 py-1.5 text-xs text-chalk-200">
            {allDistributedAssignments.length.toLocaleString()} loaded
          </span>
        </div>
        {allDistributedAssignments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-pitch-700 px-6 py-16 text-center">
            <p className="text-sm text-chalk-200">
              No current-shift or active assignments found.
            </p>
          </div>
        ) : (
          <AssignmentTable
            assignments={allDistributedAssignments}
            detailsBasePath="/admin/assignments"
            showCollector
            collectorNames={collectorNames}
            liveRefresh={false}
            realtimeRefresh={false}
          />
        )}
      </section>

      <AdminHistoricalMatchSearch />
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAllAssignments } from "@/lib/assignments/queries";
import { ASSIGNMENT_TASK_NAMES, formatDurationSeconds } from "@/lib/assignments/task-names";
import type { AssignmentTaskTimerRow } from "@/types/database.types";
import { LiveTrackedDuration } from "@/components/LiveTrackedDuration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Assignment = Awaited<ReturnType<typeof getAllAssignments>>[number];
type SearchParams = { from?: string; to?: string; task?: string; status?: string };


function duration(seconds: number) {
  return formatDurationSeconds(seconds);
}
function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? value + "T12:00:00" : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function statusClasses(status: string) {
  if (status === "Completed" || status === "Ended") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  if (status === "In Progress" || status === "Running") return "border-sky-400/30 bg-sky-400/10 text-sky-200";
  if (status === "Overdue") return "border-rose-400/30 bg-rose-400/10 text-rose-200";
  return "border-clock-amber/30 bg-clock-amber/10 text-clock-amber";
}
function StatusPill({ status }: { status: string }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusClasses(status)}`}>{status}</span>;
}
function Metric({ label, value, note, accent }: { label: string; value: string; note: string; accent: string }) {
  return <article className="relative min-w-0 overflow-hidden rounded-xl border border-pitch-700 bg-pitch-950/90 p-4 sm:p-5">
    <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${accent}`} />
    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-chalk-200">{label}</p>
    <p className="mt-2 break-words font-display text-2xl font-semibold tabular-nums text-chalk-50 sm:text-3xl">{value}</p>
    <p className="mt-1 text-xs text-chalk-300">{note}</p>
  </article>;
}

export default async function CollectorShiftAnalysisPage({ params, searchParams }: { params: Promise<{ collectorId: string }>; searchParams?: Promise<SearchParams> }) {
  const { collectorId } = await params;
  const filters = searchParams ? await searchParams : {};
  const from = filters.from ?? "";
  const to = filters.to ?? "";
  const requestedTask = filters.task ?? "";
  const selectedTask = (ASSIGNMENT_TASK_NAMES as readonly string[]).includes(requestedTask) ? requestedTask : "";
  const requestedStatus = filters.status ?? "";
  const allowedStatuses = ["Completed", "In Progress", "Overdue", "Not Started"];
  const selectedStatus = allowedStatuses.includes(requestedStatus) ? requestedStatus : "";
  const supabase = createClient();
  const [profileResult, assignmentsResult, timersResult] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, hr_code, role, is_protected_admin").is("deleted_at", null).eq("id", collectorId).maybeSingle(),
    getAllAssignments(supabase),
    supabase.from("assignment_task_timers").select("*").order("started_at", { ascending: true }),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (timersResult.error) throw timersResult.error;
  const profile = profileResult.data;
  if (!profile) notFound();

  const allCollectorAssignments = (assignmentsResult as Assignment[])
    .filter((assignment) => assignment.collector_id === profile.id);
  const timers = (timersResult.data ?? []) as AssignmentTaskTimerRow[];
  const allAssignmentIds = new Set(allCollectorAssignments.map((assignment) => assignment.id));
  const allCollectorTimers = timers.filter((timer) => allAssignmentIds.has(timer.assignment_id));
  const allTimersByAssignment = new Map<string, AssignmentTaskTimerRow[]>();
  for (const timer of allCollectorTimers) {
    const bucket = allTimersByAssignment.get(timer.assignment_id) ?? [];
    bucket.push(timer);
    allTimersByAssignment.set(timer.assignment_id, bucket);
  }
  const assignments = allCollectorAssignments
    .filter((assignment) => {
      const date = (assignment.shift_date ?? assignment.match.match_date ?? "").slice(0, 10);
      if (from && date < from) return false;
      if (to && date > to) return false;
      if (selectedStatus && assignment.status !== selectedStatus) return false;
      if (selectedTask && !(allTimersByAssignment.get(assignment.id) ?? []).some((timer) => timer.task_name === selectedTask)) return false;
      return true;
    })
    .sort((a, b) => (b.shift_date ?? b.match.match_date ?? "").localeCompare(a.shift_date ?? a.match.match_date ?? ""));
  const assignmentIds = new Set(assignments.map((assignment) => assignment.id));
  const collectorTimers = timers.filter((timer) => assignmentIds.has(timer.assignment_id) && (!selectedTask || timer.task_name === selectedTask));
  const timersByAssignment = new Map<string, AssignmentTaskTimerRow[]>();
  for (const timer of collectorTimers) {
    const bucket = timersByAssignment.get(timer.assignment_id) ?? [];
    bucket.push(timer);
    timersByAssignment.set(timer.assignment_id, bucket);
  }

  const completed = assignments.filter((assignment) => assignment.status === "Completed").length;
  const notStarted = assignments.filter((assignment) => assignment.status === "Not Started").length;
  const active = assignments.filter((assignment) => assignment.status === "In Progress" || assignment.status === "Overdue").length;
  const runningTimers = collectorTimers.filter((timer) => !timer.ended_at).length;
  const taskRows = ASSIGNMENT_TASK_NAMES.filter((name) => !selectedTask || name === selectedTask).map((name) => {
    const taskTimers = collectorTimers.filter((timer) => timer.task_name === name);
    const ended = taskTimers.filter((timer) => timer.ended_at && timer.duration_seconds !== null);
    const seconds = ended.reduce((sum, timer) => sum + (timer.duration_seconds ?? 0), 0);
    return { name, count: ended.length, running: taskTimers.filter((timer) => !timer.ended_at).length, seconds, avg: ended.length ? Math.round(seconds / ended.length) : null };
  });

  return (
    <div className="shift-analysis-page relative isolate mx-auto w-full min-w-0 max-w-[1600px] space-y-6 pb-10 sm:space-y-8">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-20 bg-cover bg-center opacity-20" style={{ backgroundImage: 'url("/images/football/pitch-background-tactical.webp")' }} />
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(180deg,rgba(1,22,20,0.68)_0%,rgba(1,22,20,0.9)_55%,rgba(1,22,20,0.96)_100%)]" />

      <header className="relative isolate overflow-hidden rounded-2xl border border-pitch-700 bg-pitch-950 shadow-xl shadow-black/20">
        <div aria-hidden="true" className="absolute inset-0 -z-20 bg-cover bg-center opacity-60" style={{ backgroundImage: 'url("/images/football/tactics-background.jpg")' }} />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,rgba(2,20,19,0.97)_0%,rgba(2,25,23,0.9)_62%,rgba(2,20,19,0.55)_100%)]" />
        <div className="flex flex-wrap items-start justify-between gap-5 p-5 sm:p-7 lg:p-9">
          <div className="min-w-0">
            <Link href="/admin/shift-analysis" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-clock-amber/40 bg-black/20 px-4 text-xs font-semibold text-clock-amber transition hover:bg-clock-amber/10">← Back to Shift Analysis</Link>
            <p className="mt-5 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-clock-amber">Individual performance profile</p>
            <h1 className="mt-2 break-words font-display text-3xl leading-tight text-white sm:text-4xl lg:text-5xl">{profile.full_name ?? profile.email ?? "Collector"}<span className="text-clock-amber">.</span></h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-chalk-200">
              {profile.hr_code && <span className="rounded-md border border-pitch-700 bg-pitch-950/80 px-2.5 py-1 font-mono text-xs">{profile.hr_code}</span>}
              <span className="rounded-md border border-pitch-700 bg-pitch-950/80 px-2.5 py-1">{profile.role === "admin" ? "Admin" : "Collector"}{profile.is_protected_admin ? " · Protected" : ""}</span>
              {profile.email && <span className="break-all">{profile.email}</span>}
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/80">Your selected profile’s assignments, task durations, completion status and match-by-match activity. All figures on this page belong to this account only.</p>
          </div>
          <aside className="min-w-[190px] rounded-xl border border-clock-amber/35 bg-[#031c1a]/90 p-5">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-chalk-200">Tracked task time</p>
            <p className="mt-3 font-display text-3xl font-bold tabular-nums text-white"><LiveTrackedDuration timers={collectorTimers} /></p>
            <p className="mt-1 text-xs text-chalk-200">Ended + running timers · this profile</p>
          </aside>
        </div>
      </header>

      <form method="get" className="grid gap-3 rounded-xl border border-pitch-700 bg-pitch-950/90 p-4 sm:grid-cols-2 lg:grid-cols-[1.2fr_1.2fr_1.5fr_1.2fr_auto_auto] lg:items-end">
        <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-chalk-200">From date
          <input type="date" name="from" value={from} max={to || undefined} className="mt-2 block min-h-10 w-full rounded-lg border border-pitch-700 bg-pitch-900 px-3 text-sm text-chalk-50" />
        </label>
        <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-chalk-200">To date
          <input type="date" name="to" value={to} min={from || undefined} className="mt-2 block min-h-10 w-full rounded-lg border border-pitch-700 bg-pitch-900 px-3 text-sm text-chalk-50" />
        </label>
        <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-chalk-200">Task
          <select name="task" value={selectedTask} className="mt-2 block min-h-10 w-full rounded-lg border border-pitch-700 bg-pitch-900 px-3 text-sm text-chalk-50">
            <option value="">All tasks</option>
            {ASSIGNMENT_TASK_NAMES.map((name) => <option key={name} value={name}>{name.replace("  ", " ")}</option>)}
          </select>
        </label>
        <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-chalk-200">Status
          <select name="status" value={selectedStatus} className="mt-2 block min-h-10 w-full rounded-lg border border-pitch-700 bg-pitch-900 px-3 text-sm text-chalk-50">
            <option value="">All statuses</option><option value="Completed">Completed</option><option value="In Progress">In Progress</option><option value="Overdue">Overdue</option><option value="Not Started">Not Started</option>
          </select>
        </label>
        <button className="min-h-10 rounded-lg bg-clock-amber px-4 text-xs font-bold text-ink transition hover:brightness-110" type="submit">Apply filters</button>
        <Link href={`/admin/shift-analysis/collector/${encodeURIComponent(profile.id)}`} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-pitch-700 px-4 text-xs font-semibold text-chalk-100 transition hover:border-clock-amber">Reset</Link>
      </form>
      <p className="text-xs text-chalk-300">Showing {assignments.length} assignment(s){from ? ` from ${formatDate(from)}` : ""}{to ? ` to ${formatDate(to)}` : ""}{selectedTask ? ` · Task: ${selectedTask}` : ""}{selectedStatus ? ` · Status: ${selectedStatus}` : ""}.</p>

      <section aria-label="Collector summary" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Assignments" value={assignments.length.toLocaleString()} note="All assignments owned by this account" accent="bg-clock-amber" />
        <Metric label="Completed" value={completed.toLocaleString()} note={assignments.length ? `${Math.round(completed / assignments.length * 100)}% of this profile’s assignments` : "No assignments yet"} accent="bg-emerald-400" />
        <Metric label="Not started" value={notStarted.toLocaleString()} note="Assignments waiting to begin" accent="bg-clock-amber" />
        <Metric label="In progress / overdue" value={active.toLocaleString()} note={`${runningTimers} running task timer(s)`} accent="bg-sky-400" />
      </section>

      <section className="overflow-hidden rounded-xl border border-pitch-700 bg-pitch-950/95 shadow-lg shadow-black/10">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-pitch-700 bg-[#07342f] px-4 py-4 sm:px-5">
          <div><p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-clock-amber">Task performance · {profile.full_name ?? profile.email}</p><h2 className="mt-1 font-display text-xl text-chalk-50">Average time by task</h2></div>
          <p className="text-xs text-chalk-200">Only ended timers contribute to averages</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-pitch-900 text-[10px] uppercase tracking-wide text-chalk-200"><tr><th className="px-4 py-3">Task</th><th className="px-4 py-3">Avg duration</th><th className="px-4 py-3">Completed timers</th><th className="px-4 py-3">Running</th><th className="px-4 py-3">Total tracked</th></tr></thead>
            <tbody className="divide-y divide-pitch-800">
              {taskRows.map((row) => <tr key={row.name} className="transition hover:bg-pitch-900/70"><td className="whitespace-nowrap px-4 py-3 font-medium text-chalk-50">{row.name.replace("  ", " ")}</td><td className="whitespace-nowrap px-4 py-3 font-mono text-chalk-50">{row.avg === null ? "—" : duration(row.avg)}</td><td className="px-4 py-3 tabular-nums text-emerald-200">{row.count}</td><td className="px-4 py-3 tabular-nums text-sky-200">{row.running}</td><td className="whitespace-nowrap px-4 py-3 font-mono text-chalk-100"><LiveTrackedDuration timers={collectorTimers.filter((timer) => timer.task_name === row.name)} /></td></tr>)}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-pitch-700 bg-pitch-950/95 shadow-lg shadow-black/10">
        <div className="border-b border-pitch-700 bg-[#07342f] px-4 py-4 sm:px-5"><p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-clock-amber">Individual match history</p><h2 className="mt-1 font-display text-xl text-chalk-50">Match-by-match breakdown</h2><p className="mt-1 text-xs text-chalk-200">Every row and timer below belongs only to {profile.full_name ?? profile.email}.</p></div>
        <div className="divide-y divide-pitch-800">
          {assignments.map((assignment) => {
            const matchTimers = timersByAssignment.get(assignment.id) ?? [];
            return <details key={assignment.id} className="group">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-4 transition hover:bg-pitch-900/60 sm:px-5 [&::-webkit-details-marker]:hidden">
                <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-pitch-700 bg-pitch-900 text-clock-amber transition group-open:rotate-90">›</span>
                <span className="min-w-0 flex-1"><span className="block break-words font-semibold text-chalk-50">{assignment.match.home_team} <span className="text-clock-amber">vs</span> {assignment.match.away_team}</span><span className="mt-1 block text-xs text-chalk-300">Match ID {assignment.match.external_id} · {formatDate(assignment.shift_date)} · {assignment.task} · {assignment.half}</span></span>
                <span className="font-mono text-xs text-chalk-200"><LiveTrackedDuration timers={matchTimers} /></span><StatusPill status={assignment.status} />
              </summary>
              <div className="border-t border-pitch-800 bg-black/10 px-3 py-4 sm:px-5">
                <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-3">
                  <div className="rounded-lg border border-pitch-800 bg-pitch-900/70 p-3"><p className="text-[9px] uppercase tracking-wide text-chalk-300">Shift date</p><p className="mt-1 text-sm font-semibold text-chalk-50">{formatDate(assignment.shift_date)}</p></div>
                  <div className="rounded-lg border border-pitch-800 bg-pitch-900/70 p-3"><p className="text-[9px] uppercase tracking-wide text-chalk-300">Assignment status</p><div className="mt-2"><StatusPill status={assignment.status} /></div></div>
                  <div className="rounded-lg border border-pitch-800 bg-pitch-900/70 p-3"><p className="text-[9px] uppercase tracking-wide text-chalk-300">Tracked task time</p><p className="mt-1 font-mono text-sm font-semibold text-chalk-50"><LiveTrackedDuration timers={matchTimers} /></p></div>
                </div>
                <div className="overflow-x-auto rounded-lg border border-pitch-800">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead className="bg-pitch-900 text-[10px] uppercase tracking-wide text-chalk-200"><tr><th className="px-3 py-2.5">Task</th><th className="px-3 py-2.5">Started</th><th className="px-3 py-2.5">Ended</th><th className="px-3 py-2.5">Duration</th><th className="px-3 py-2.5">Timer status</th></tr></thead>
                    <tbody className="divide-y divide-pitch-800">
                      {ASSIGNMENT_TASK_NAMES.filter((name) => !selectedTask || name === selectedTask).map((name) => {
                        const timer = matchTimers.find((item) => item.task_name === name);
                        const timerStatus = !timer ? "Not started" : timer.ended_at ? "Ended" : "Running";
                        return <tr key={name} className="hover:bg-pitch-900/50"><td className="px-3 py-2.5 font-medium text-chalk-50">{name.replace("  ", " ")}</td><td className="whitespace-nowrap px-3 py-2.5 text-chalk-200">{timer ? new Date(timer.started_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—"}</td><td className="whitespace-nowrap px-3 py-2.5 text-chalk-200">{timer?.ended_at ? new Date(timer.ended_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—"}</td><td className="whitespace-nowrap px-3 py-2.5 font-mono text-chalk-50">{timer ? <LiveTrackedDuration timers={[timer]} /> : "—"}</td><td className="px-3 py-2.5"><StatusPill status={timerStatus} /></td></tr>;
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex justify-end"><Link href={`/admin/assignments/${assignment.id}`} className="text-xs font-semibold text-clock-amber transition hover:text-white">Open assignment details ↗</Link></div>
              </div>
            </details>;
          })}
          {assignments.length === 0 && <p className="px-5 py-12 text-center text-sm text-chalk-300">No assignments are currently associated with this profile.</p>}
        </div>
      </section>
    </div>
  );
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAllAssignments } from "@/lib/assignments/queries";
import { ASSIGNMENT_TASK_NAMES, formatDurationSeconds } from "@/lib/assignments/task-names";
import type { AssignmentTaskTimerRow } from "@/types/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = { from?: string; to?: string; task?: string; collector?: string; status?: string };
type Assignment = Awaited<ReturnType<typeof getAllAssignments>>[number];

function normalizeHrCode(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}
function dateValue(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}
function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? value + "T12:00:00" : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function duration(seconds: number) {
  return formatDurationSeconds(seconds);
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
  return <article className="relative min-w-0 overflow-hidden rounded-xl border border-pitch-700 bg-pitch-950/90 p-4 shadow-lg shadow-black/10 sm:p-5">
    <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${accent}`} />
    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-chalk-200">{label}</p>
    <p className="mt-2 break-words font-display text-2xl font-semibold tabular-nums text-chalk-50 sm:text-3xl">{value}</p>
    <p className="mt-1 text-xs text-chalk-300">{note}</p>
  </article>;
}

export default async function ShiftAnalysisPage({ searchParams }: { searchParams?: SearchParams }) {
  const params = searchParams ?? {};
  const validTask = params.task && (ASSIGNMENT_TASK_NAMES as readonly string[]).includes(params.task) ? params.task : "";
  const from = params.from ?? "";
  const to = params.to ?? "";
  const requestedCollector = params.collector ?? "";
  const selectedStatus = params.status ?? "";
  const supabase = createClient();

  const [allAssignments, timerResult, profileResult] = await Promise.all([
    getAllAssignments(supabase),
    supabase.from("assignment_task_timers").select("*").order("started_at", { ascending: true }),
    // Match the Admin > Collectors page: every non-deleted profile, including protected admins.
    supabase.from("profiles").select("id, full_name, email, hr_code, role, is_protected_admin").is("deleted_at", null).order("full_name"),
  ]);
  if (timerResult.error) throw timerResult.error;
  if (profileResult.error) throw profileResult.error;

  const timers = (timerResult.data ?? []) as AssignmentTaskTimerRow[];
  const profiles = profileResult.data ?? [];
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  // Accept both current profile IDs and legacy HR-Code query parameters.
  // A stale/invalid collector parameter should never make the whole page look empty.
  const requestedProfile = profiles.find((profile) =>
    profile.id === requestedCollector ||
    normalizeHrCode(profile.hr_code) === normalizeHrCode(requestedCollector)
  );
  const selectedCollector = requestedProfile?.id ?? "";
  // Only analyze assignments whose owner is still listed in Admin > Collectors.
  const currentRosterAssignments = allAssignments.filter((assignment) => profileById.has(assignment.collector_id));
  const timersByAssignment = new Map<string, AssignmentTaskTimerRow[]>();
  for (const timer of timers) {
    const bucket = timersByAssignment.get(timer.assignment_id) ?? [];
    bucket.push(timer);
    timersByAssignment.set(timer.assignment_id, bucket);
  }

  // Remove assignments belonging to collectors who are no longer in the Team Sheet.
  const dateFiltered = currentRosterAssignments.filter((a) => {
    const date = dateValue(a.shift_date ?? a.match.match_date);
    return (!from || date >= from) && (!to || date <= to);
  });
  const collectorFiltered = dateFiltered.filter((a) => {
    if (!selectedCollector) return true;
    return a.collector_id === selectedCollector;
  });
  const statusFiltered = collectorFiltered.filter((a) => !selectedStatus || a.status === selectedStatus);
  const filtered = statusFiltered.filter((a) => !validTask || (timersByAssignment.get(a.id) ?? []).some((t) => t.task_name === validTask));

  const timerInScope = filtered.flatMap((a) => timersByAssignment.get(a.id) ?? []).filter((t) => !validTask || t.task_name === validTask);
  const completedTimers = timerInScope.filter((t) => t.ended_at && t.duration_seconds !== null);
  const totalTrackedSeconds = completedTimers.reduce((sum, t) => sum + (t.duration_seconds ?? 0), 0);
  const activeTimers = timerInScope.filter((t) => !t.ended_at);
  const taskCounts = new Map<string, { completed: number; active: number; seconds: number; count: number }>();
  for (const name of ASSIGNMENT_TASK_NAMES) taskCounts.set(name, { completed: 0, active: 0, seconds: 0, count: 0 });
  for (const timer of timerInScope) {
    const row = taskCounts.get(timer.task_name);
    if (!row) continue;
    if (timer.ended_at && timer.duration_seconds !== null) {
      row.completed += 1; row.seconds += timer.duration_seconds; row.count += 1;
    } else row.active += 1;
  }

  const collectorStats = new Map<string, { name: string; hrCode: string; assignments: number; completed: number; taskSeconds: number; taskCount: number; notStarted: number; active: number }>();
  for (const assignment of filtered) {
    const profile = profileById.get(assignment.collector_id);
    if (!profile) continue;
    const name = profile.full_name ?? profile.email ?? "—";
    const stats = collectorStats.get(assignment.collector_id) ?? { name, hrCode: profile.hr_code ?? "—", assignments: 0, completed: 0, taskSeconds: 0, taskCount: 0, notStarted: 0, active: 0 };
    stats.assignments += 1;
    if (assignment.status === "Completed") stats.completed += 1;
    if (assignment.status === "Not Started") stats.notStarted += 1;
    if (assignment.status === "In Progress" || assignment.status === "Overdue") stats.active += 1;
    for (const timer of (timersByAssignment.get(assignment.id) ?? []).filter((t) => !validTask || t.task_name === validTask)) {
      if (timer.ended_at && timer.duration_seconds !== null) { stats.taskSeconds += timer.duration_seconds; stats.taskCount += 1; }
    }
    collectorStats.set(assignment.collector_id, stats);
  }
  const collectorRows = [...collectorStats.entries()].map(([id, s]) => ({ id, ...s, avg: s.taskCount ? Math.round(s.taskSeconds / s.taskCount) : null })).sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));

  const totalAssignments = filtered.length;
  const completedAssignments = filtered.filter((a) => a.status === "Completed").length;
  const notStartedAssignments = filtered.filter((a) => a.status === "Not Started").length;
  const inProgressAssignments = filtered.filter((a) => a.status === "In Progress" || a.status === "Overdue").length;
  const taskRows = [...taskCounts.entries()].filter(([name]) => !validTask || name === validTask).map(([name, v]) => ({ name, ...v, avg: v.count ? Math.round(v.seconds / v.count) : null }));

  return (
    <div className="shift-analysis-page relative isolate mx-auto w-full min-w-0 max-w-[1600px] space-y-6 pb-10 sm:space-y-8">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-20 bg-cover bg-center opacity-20" style={{ backgroundImage: 'url("/images/football/pitch-background-tactical.webp")' }} />
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(180deg,rgba(1,22,20,0.68)_0%,rgba(1,22,20,0.9)_55%,rgba(1,22,20,0.96)_100%)]" />
      <header className="relative isolate overflow-hidden rounded-2xl border border-pitch-700 bg-pitch-950 shadow-xl shadow-black/20">
        <div aria-hidden="true" className="absolute inset-0 -z-20 bg-cover bg-center opacity-70" style={{ backgroundImage: 'url("/images/football/tactics-background.jpg")' }} />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,rgba(2,20,19,0.97)_0%,rgba(2,25,23,0.9)_62%,rgba(2,20,19,0.55)_100%)]" />
        <div className="flex flex-wrap items-start justify-between gap-5 p-5 sm:p-7 lg:p-9">
          <div className="min-w-0 max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/25 px-3 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-chalk-100">
              <span className="h-1.5 w-1.5 rounded-full bg-clock-amber" /> Arqam Football Operations · Performance
            </span>
            <p className="mt-5 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-clock-amber">Task tracking intelligence</p>
            <h1 className="mt-2 font-display text-3xl leading-tight text-white sm:text-4xl lg:text-5xl">Shift <span className="text-clock-amber">Analysis.</span></h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/80 sm:text-base">Measure task duration, completion and workload across collectors, shifts and matches.</p>
          </div>
          <aside className="min-w-[190px] rounded-xl border border-clock-amber/35 bg-[#031c1a]/90 p-5">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-chalk-200">Tracked task time</p>
            <p className="mt-3 font-display text-3xl font-bold tabular-nums text-white">{duration(totalTrackedSeconds)}</p>
            <p className="mt-1 text-xs text-chalk-200">Ended timers · filtered data</p>
          </aside>
        </div>
      </header>

      <form method="get" className="grid gap-3 rounded-xl border border-pitch-700 bg-pitch-950/90 p-4 sm:grid-cols-2 lg:grid-cols-[1.2fr_1.2fr_1.6fr_1fr_1fr_auto_auto] lg:items-end">
        <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-chalk-200">From date
          <input type="date" name="from" defaultValue={from} className="mt-2 block min-h-10 w-full rounded-lg border border-pitch-700 bg-pitch-900 px-3 text-sm text-chalk-50" />
        </label>
        <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-chalk-200">To date
          <input type="date" name="to" defaultValue={to} className="mt-2 block min-h-10 w-full rounded-lg border border-pitch-700 bg-pitch-900 px-3 text-sm text-chalk-50" />
        </label>
        <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-chalk-200">Collector
          <select name="collector" defaultValue={selectedCollector} className="mt-2 block min-h-10 w-full rounded-lg border border-pitch-700 bg-pitch-900 px-3 text-sm text-chalk-50">
            <option value="">All collectors</option>
            {[...profiles].sort((a, b) => (a.full_name ?? a.email ?? "").localeCompare(b.full_name ?? b.email ?? "")).map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name ?? profile.email ?? "—"}{profile.hr_code ? ` · ${profile.hr_code}` : ""}{profile.role === "admin" ? " · Admin" : ""}{profile.is_protected_admin ? " · Protected" : ""}</option>)}
          </select>
        </label>
        <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-chalk-200">Task
          <select name="task" defaultValue={validTask} className="mt-2 block min-h-10 w-full rounded-lg border border-pitch-700 bg-pitch-900 px-3 text-sm text-chalk-50">
            <option value="">All tasks</option>
            {ASSIGNMENT_TASK_NAMES.map((name) => <option key={name} value={name}>{name.replace("  ", " ")}</option>)}
          </select>
        </label>
        <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-chalk-200">Status
          <select name="status" defaultValue={selectedStatus} className="mt-2 block min-h-10 w-full rounded-lg border border-pitch-700 bg-pitch-900 px-3 text-sm text-chalk-50">
            <option value="">All statuses</option><option>Completed</option><option>In Progress</option><option>Overdue</option><option>Not Started</option>
          </select>
        </label>
        <button className="min-h-10 rounded-lg bg-clock-amber px-4 text-xs font-bold text-ink transition hover:brightness-110" type="submit">Apply filters</button>
        <Link href="/admin/shift-analysis" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-pitch-700 px-4 text-xs font-semibold text-chalk-100 transition hover:border-clock-amber">Reset</Link>
      </form>

      <section aria-label="Shift summary" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Assignments" value={totalAssignments.toLocaleString()} note="Matching the selected filters" accent="bg-clock-amber" />
        <Metric label="Completed" value={completedAssignments.toLocaleString()} note={totalAssignments ? `${Math.round(completedAssignments / totalAssignments * 100)}% of filtered assignments` : "No matching assignments"} accent="bg-emerald-400" />
        <Metric label="Not started" value={notStartedAssignments.toLocaleString()} note="Assignments waiting to begin" accent="bg-clock-amber" />
        <Metric label="In progress / overdue" value={inProgressAssignments.toLocaleString()} note="Active work and SLA breaches" accent="bg-sky-400" />
      </section>

      <section className="overflow-hidden rounded-xl border border-pitch-700 bg-pitch-950/95 shadow-lg shadow-black/10">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-pitch-700 bg-[#07342f] px-4 py-4 sm:px-5">
          <div><p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-clock-amber">Task performance</p><h2 className="mt-1 font-display text-xl text-chalk-50">Average time by task</h2></div>
          <p className="text-xs text-chalk-200">Only ended timers contribute to averages</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-pitch-900 text-[10px] uppercase tracking-wide text-chalk-200"><tr><th className="px-4 py-3 font-semibold">Task</th><th className="px-4 py-3 font-semibold">Avg duration</th><th className="px-4 py-3 font-semibold">Completed timers</th><th className="px-4 py-3 font-semibold">Running</th><th className="px-4 py-3 font-semibold">Total tracked</th><th className="px-4 py-3 font-semibold">Completion share</th></tr></thead>
            <tbody className="divide-y divide-pitch-800">
              {taskRows.map((row) => <tr key={row.name} className="transition hover:bg-pitch-900/70">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-chalk-50">{row.name.replace("  ", " ")}</td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-chalk-50">{row.avg === null ? "—" : duration(row.avg)}</td>
                <td className="px-4 py-3 tabular-nums text-chalk-100">{row.completed}</td><td className="px-4 py-3 tabular-nums text-sky-200">{row.active}</td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-chalk-100">{duration(row.seconds)}</td>
                <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="h-1.5 w-24 overflow-hidden rounded-full bg-pitch-800"><div className="h-full rounded-full bg-clock-amber" style={{ width: `${row.completed + row.active ? row.completed / (row.completed + row.active) * 100 : 0}%` }} /></div><span className="text-xs text-chalk-200">{row.completed + row.active ? Math.round(row.completed / (row.completed + row.active) * 100) : 0}%</span></div></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-pitch-700 bg-pitch-950/95 shadow-lg shadow-black/10">
        <div className="border-b border-pitch-700 bg-[#07342f] px-4 py-4 sm:px-5"><p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-clock-amber">Collector leaderboard</p><h2 className="mt-1 font-display text-xl text-chalk-50">Collector performance</h2><p className="mt-1 text-xs text-chalk-200">Average completed task duration, with assignment workload and current status.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-pitch-900 text-[10px] uppercase tracking-wide text-chalk-200"><tr><th className="px-4 py-3 font-semibold">Collector</th><th className="px-4 py-3 font-semibold">HR code</th><th className="px-4 py-3 font-semibold">Avg task time</th><th className="px-4 py-3 font-semibold">Assignments</th><th className="px-4 py-3 font-semibold">Completed</th><th className="px-4 py-3 font-semibold">Not started</th><th className="px-4 py-3 font-semibold">Active</th><th className="px-4 py-3 font-semibold">Details</th></tr></thead>
            <tbody className="divide-y divide-pitch-800">
              {collectorRows.map((row) => <tr key={row.id} className="transition hover:bg-pitch-900/70">
                <td className="whitespace-nowrap px-4 py-3 font-semibold text-chalk-50">{row.name}</td><td className="px-4 py-3 font-mono text-chalk-200">{row.hrCode}</td><td className="whitespace-nowrap px-4 py-3 font-mono text-chalk-50">{row.avg === null ? "—" : duration(row.avg)}</td><td className="px-4 py-3 tabular-nums text-chalk-100">{row.assignments}</td><td className="px-4 py-3 tabular-nums text-emerald-200">{row.completed}</td><td className="px-4 py-3 tabular-nums text-clock-amber">{row.notStarted}</td><td className="px-4 py-3 tabular-nums text-sky-200">{row.active}</td><td className="px-4 py-3"><Link href={`/admin/shift-analysis/collector/${encodeURIComponent(row.id)}`} className="inline-flex whitespace-nowrap rounded-md border border-clock-amber/40 px-3 py-1.5 text-xs font-semibold text-clock-amber transition hover:bg-clock-amber/10">View details ↗</Link></td>
              </tr>)}
              {collectorRows.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-chalk-300">No collectors match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section id="match-breakdown" className="scroll-mt-24 overflow-hidden rounded-xl border border-pitch-700 bg-pitch-950/95 shadow-lg shadow-black/10">
        <div className="border-b border-pitch-700 bg-[#07342f] px-4 py-4 sm:px-5"><p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-clock-amber">Match-level drill-down</p><h2 className="mt-1 font-display text-xl text-chalk-50">Match-by-match breakdown</h2><p className="mt-1 text-xs text-chalk-200">Expand any match to inspect all seven task timers, start/end timestamps and recorded durations.</p></div>
        <div className="divide-y divide-pitch-800">
          {filtered.slice().sort((a, b) => (b.shift_date ?? b.match.match_date).localeCompare(a.shift_date ?? a.match.match_date)).map((assignment) => {
            const profile = profileById.get(assignment.collector_id);
            const matchTimers = (timersByAssignment.get(assignment.id) ?? []).filter((t) => !validTask || t.task_name === validTask);
            const seconds = matchTimers.reduce((sum, t) => sum + (t.duration_seconds ?? 0), 0);
            return <details key={assignment.id} className="group">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-4 transition hover:bg-pitch-900/60 sm:px-5 [&::-webkit-details-marker]:hidden">
                <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-pitch-700 bg-pitch-900 text-clock-amber transition group-open:rotate-90">›</span>
                <span className="min-w-0 flex-1"><span className="block break-words font-semibold text-chalk-50">{assignment.match.home_team} <span className="text-clock-amber">vs</span> {assignment.match.away_team}</span><span className="mt-1 block text-xs text-chalk-300">Match ID {assignment.match.external_id} · {formatDate(assignment.match.match_date)} · {profile?.full_name ?? profile?.email ?? "—"} · {assignment.task} · {assignment.half}</span></span>
                <span className="font-mono text-xs text-chalk-200">{duration(seconds)}</span><StatusPill status={assignment.status} />
              </summary>
              <div className="border-t border-pitch-800 bg-black/10 px-3 py-4 sm:px-5">
                <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                  <div className="rounded-lg border border-pitch-800 bg-pitch-900/70 p-3"><p className="text-[9px] uppercase tracking-wide text-chalk-300">Collector</p><p className="mt-1 break-words text-sm font-semibold text-chalk-50">{profile?.full_name ?? profile?.email ?? "—"}</p><p className="mt-1 font-mono text-[10px] text-chalk-300">{profile?.hr_code ?? "—"}</p></div>
                  <div className="rounded-lg border border-pitch-800 bg-pitch-900/70 p-3"><p className="text-[9px] uppercase tracking-wide text-chalk-300">Shift date</p><p className="mt-1 text-sm font-semibold text-chalk-50">{formatDate(assignment.shift_date ?? assignment.match.match_date)}</p></div>
                  <div className="rounded-lg border border-pitch-800 bg-pitch-900/70 p-3"><p className="text-[9px] uppercase tracking-wide text-chalk-300">Assignment status</p><div className="mt-2"><StatusPill status={assignment.status} /></div></div>
                  <div className="rounded-lg border border-pitch-800 bg-pitch-900/70 p-3"><p className="text-[9px] uppercase tracking-wide text-chalk-300">Tracked task time</p><p className="mt-1 font-mono text-sm font-semibold text-chalk-50">{duration(seconds)}</p></div>
                </div>
                <div className="overflow-x-auto rounded-lg border border-pitch-800">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead className="bg-pitch-900 text-[10px] uppercase tracking-wide text-chalk-200"><tr><th className="px-3 py-2.5">Task</th><th className="px-3 py-2.5">Started</th><th className="px-3 py-2.5">Ended</th><th className="px-3 py-2.5">Duration</th><th className="px-3 py-2.5">Timer status</th></tr></thead>
                    <tbody className="divide-y divide-pitch-800">
                      {ASSIGNMENT_TASK_NAMES.filter((name) => !validTask || name === validTask).map((name) => {
                        const timer = (timersByAssignment.get(assignment.id) ?? []).find((t) => t.task_name === name);
                        const timerStatus = !timer ? "Not started" : timer.ended_at ? "Ended" : "Running";
                        return <tr key={name} className="hover:bg-pitch-900/50"><td className="px-3 py-2.5 font-medium text-chalk-50">{name.replace("  ", " ")}</td><td className="whitespace-nowrap px-3 py-2.5 text-chalk-200">{timer ? new Date(timer.started_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—"}</td><td className="whitespace-nowrap px-3 py-2.5 text-chalk-200">{timer?.ended_at ? new Date(timer.ended_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—"}</td><td className="whitespace-nowrap px-3 py-2.5 font-mono text-chalk-50">{timer?.ended_at && timer.duration_seconds !== null ? duration(timer.duration_seconds) : timer && !timer.ended_at ? "Running" : "—"}</td><td className="px-3 py-2.5"><StatusPill status={timerStatus} /></td></tr>;
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex justify-end"><Link href={`/admin/assignments/${assignment.id}`} className="text-xs font-semibold text-clock-amber transition hover:text-white">Open assignment details ↗</Link></div>
              </div>
            </details>;
          })}
          {filtered.length === 0 && <p className="px-5 py-12 text-center text-sm text-chalk-300">No assignments match the selected filters.</p>}
        </div>
      </section>
      <p className="text-[10px] leading-5 text-chalk-300">Duration averages use ended task timers only. Active timers are displayed separately and are not included in completed-duration totals. All results are calculated from the currently available Supabase assignments and task timer records.</p>
    </div>
  );
}

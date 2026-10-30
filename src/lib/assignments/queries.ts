import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssignmentStatus, AssignmentTaskTimerRow, Database, MatchRow } from "@/types/database.types";
import type { AssignmentWithMatch } from "./types";

type Client = SupabaseClient<Database>;

function queryErrorFields(error: unknown): { message: string; code: string; details: string; hint: string } {
  const candidate = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  return {
    message: candidate.message == null ? "" : String(candidate.message),
    code: candidate.code == null ? "" : String(candidate.code),
    details: candidate.details == null ? "" : String(candidate.details),
    hint: candidate.hint == null ? "" : String(candidate.hint),
  };
}

function assignmentQueryCounts(assignments: Database["public"]["Tables"]["assignments"]["Row"][]) {
  return {
    assignmentCount: assignments.length,
    uniqueMatchIds: new Set(assignments.map((assignment) => assignment.match_id)).size,
    uniqueCollectorIds: new Set(assignments.map((assignment) => assignment.collector_id)).size,
  };
}

/**
 * Nested `select("*, match:matches(*)")` typing doesn't infer well against
 * our hand-written Database type (empty `Relationships` — see
 * database.types.ts's regeneration note), so assignments and their
 * matches are fetched separately and joined in JS. Keeps the types honest
 * instead of casting through `any`.
 */
const MATCH_ID_CHUNK_SIZE = 100;
const ASSIGNMENTS_PAGE_SIZE = 1000;

async function attachMatches(
  supabase: Client,
  assignments: Database["public"]["Tables"]["assignments"]["Row"][]
): Promise<AssignmentWithMatch[]> {
  if (assignments.length === 0) return [];

  const matchIds = [...new Set(assignments.map((a) => a.match_id))];
  const counts = assignmentQueryCounts(assignments);
  console.error("Admin dashboard query start", {
    query: "attachMatches matches query",
    ...counts,
  });

  const matches: MatchRow[] = [];
  const matchChunks: string[][] = [];
  for (let i = 0; i < matchIds.length; i += MATCH_ID_CHUNK_SIZE) {
    matchChunks.push(matchIds.slice(i, i + MATCH_ID_CHUNK_SIZE));
  }

  // Avoid serial round trips for large dashboards while keeping query sizes bounded.
  const MATCH_QUERY_CONCURRENCY = 8;
  for (let i = 0; i < matchChunks.length; i += MATCH_QUERY_CONCURRENCY) {
    const chunkResults = await Promise.all(
      matchChunks.slice(i, i + MATCH_QUERY_CONCURRENCY).map(async (chunk) => {
        const { data, error } = await supabase
          .from("matches")
          .select("*")
          .in("id", chunk);
        if (error) {
          console.error("Admin dashboard query failed", {
            query: "attachMatches matches query",
            ...counts,
            ...queryErrorFields(error),
          });
          throw error;
        }
        return data ?? [];
      }),
    );
    for (const rows of chunkResults) matches.push(...rows);
  }

  console.error("Admin dashboard query complete", {
    query: "attachMatches matches query",
    ...counts,
    matchesReturned: matches.length,
  });

  const byId = new Map<string, MatchRow>(matches.map((m) => [m.id, m]));

  return assignments
    .filter((a) => byId.has(a.match_id))
    .map((a) => ({ ...a, match: byId.get(a.match_id)! }));
}

/** All assignments belonging to one collector (RLS also enforces this). */
export async function getAssignmentsForCollector(
  supabase: Client,
  collectorId: string
): Promise<AssignmentWithMatch[]> {
  const { data, error } = await supabase
    .from("assignments")
    .select("*")
    .eq("collector_id", collectorId);

  if (error) throw error;
  return attachMatches(supabase, data ?? []);
}


/** Fetch task timers only for assignments already narrowed by the calling page. */
export async function getAssignmentTaskTimersForAssignments(
  supabase: Client,
  assignmentIds: string[]
): Promise<AssignmentTaskTimerRow[]> {
  if (assignmentIds.length === 0) return [];
  const rows: AssignmentTaskTimerRow[] = [];
  const chunkSize = 100;
  for (let i = 0; i < assignmentIds.length; i += chunkSize) {
    const { data, error } = await supabase
      .from("assignment_task_timers")
      .select("*")
      .in("assignment_id", assignmentIds.slice(i, i + chunkSize))
      .order("started_at", { ascending: true });
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

/** Admin analytics assignments constrained in Postgres before match hydration. */
export async function getAdminShiftAnalysisAssignments(
  supabase: Client,
  filters: { from?: string; to?: string; status?: AssignmentStatus }
): Promise<AssignmentWithMatch[]> {
  let query = supabase.from("assignments").select("*");
  if (filters.from) query = query.gte("shift_date", filters.from);
  if (filters.to) query = query.lte("shift_date", filters.to);
  if (filters.status) query = query.eq("status", filters.status);
  const { data, error } = await query.order("shift_date", { ascending: false });
  if (error) throw error;
  return attachMatches(supabase, data ?? []);
}

/** All assignments visible to the caller (admin — RLS allows this). */
export async function getAllAssignments(supabase: Client): Promise<AssignmentWithMatch[]> {
  // PostgREST caps a single response at the configured max row count (commonly 1,000).
  // Fetch every page in a stable order so analytics and historical drill-downs
  // don't silently omit older/newer shifts when the assignments table grows.
  const assignments: Database["public"]["Tables"]["assignments"]["Row"][] = [];

  for (let from = 0; ; from += ASSIGNMENTS_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("assignments")
      .select("*")
      .order("id", { ascending: true })
      .range(from, from + ASSIGNMENTS_PAGE_SIZE - 1);

    if (error) throw error;

    const page = data ?? [];
    assignments.push(...page);
    if (page.length < ASSIGNMENTS_PAGE_SIZE) break;
  }

  return attachMatches(supabase, assignments);
}

/** Admin Dashboard assignments. Hidden rows remain in the database and history. */
export async function getAdminDashboardAssignments(supabase: Client): Promise<AssignmentWithMatch[]> {
  console.error("Admin dashboard query start", {
    query: "admin assignments query",
  });

  // Supabase/PostgREST limits a single response to a maximum page size. Fetch
  // every page so recent assignments aren't silently omitted once the table
  // grows beyond that limit.
  const assignments: Database["public"]["Tables"]["assignments"]["Row"][] = [];
  for (let from = 0; ; from += ASSIGNMENTS_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("assignments")
      .select("*")
      .eq("hidden_from_admin_dashboard", false)
      .eq("distribution_present", true)
      .order("id", { ascending: true })
      .range(from, from + ASSIGNMENTS_PAGE_SIZE - 1);

    if (error) {
      console.error("Admin dashboard query failed", {
        query: "admin assignments query",
        offset: from,
        ...queryErrorFields(error),
      });
      throw error;
    }

    const page = data ?? [];
    assignments.push(...page);
    if (page.length < ASSIGNMENTS_PAGE_SIZE) break;
  }

  console.error("Admin dashboard query complete", {
    query: "admin assignments query",
    ...assignmentQueryCounts(assignments),
  });
  return attachMatches(supabase, assignments);
}

export async function getAssignmentById(
  supabase: Client,
  assignmentId: string
): Promise<AssignmentWithMatch | null> {
  const { data, error } = await supabase
    .from("assignments")
    .select("*")
    .eq("id", assignmentId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const [withMatch] = await attachMatches(supabase, [data]);
  return withMatch ?? null;
}

export async function getMatchCollaborators(supabase: Client, matchId: string) {
  const { data, error } = await supabase.rpc("get_match_collaborators", {
    p_match_id: matchId,
  });
  if (error) throw error;
  return data ?? [];
}

export async function getMatchCollaboratorsWithContacts(supabase: Client, matchId: string) {
  const { data, error } = await supabase.rpc("get_match_collaborators_contact", {
    p_match_id: matchId,
  });
  if (error) throw error;
  return data ?? [];
}

export async function getCollectorTeammates(supabase: Client) {
  const { data, error } = await supabase.rpc("get_collector_teammates");
  if (error) throw error;
  return data ?? [];
}

export async function getAssignmentTaskTimers(
  supabase: Client,
  assignmentId: string
): Promise<AssignmentTaskTimerRow[]> {
  const { data, error } = await supabase
    .from("assignment_task_timers")
    .select("*")
    .eq("assignment_id", assignmentId)
    .order("started_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}


/**
 * Small, live subset for the shared admin shell. The shell only renders SLA
 * alerts, so completed historical assignments are intentionally not fetched
 * on every admin route transition.
 */
export async function getAdminSlaAlertAssignments(supabase: Client): Promise<AssignmentWithMatch[]> {
  const { data, error } = await supabase
    .from("assignments")
    .select("*")
    .eq("hidden_from_admin_dashboard", false)
    .eq("distribution_present", true)
    .neq("status", "Completed");

  if (error) throw error;
  return attachMatches(supabase, data ?? []);
}

/**
 * Small, live subset for the collector shell. Include assignments still
 * present in the active distribution plus in-progress/overdue work, but never
 * load completed historical work just to build navigation SLA alerts.
 */
export async function getCollectorSlaAlertAssignments(
  supabase: Client,
  collectorId: string
): Promise<AssignmentWithMatch[]> {
  const { data, error } = await supabase
    .from("assignments")
    .select("*")
    .eq("collector_id", collectorId)
    .neq("status", "Completed")
    .or('distribution_present.eq.true,status.eq."In Progress",status.eq."Overdue"');

  if (error) throw error;
  return attachMatches(supabase, data ?? []);
}


/**
 * Default admin dashboard query: today's selected shift plus live work that
 * still needs attention. Historical completed assignments are retrieved only
 * through the explicit archive search endpoint.
 */
export async function getAdminDashboardAssignmentsForShift(
  supabase: Client,
  shiftDate: string
): Promise<AssignmentWithMatch[]> {
  // shift_date is a PostgreSQL date column, so filter with ISO YYYY-MM-DD only.
  // Only assignments still present in the live Distribution are included for
  // the selected shift, and stale Overdue rows removed/reassigned in the Sheet
  // are excluded. Keep In Progress work visible even if its row was removed.
  // Split the broad OR into two selective, parallel queries. This lets Postgres
  // use the shift-date and status/distribution indexes independently instead of
  // planning one OR across today's assignments and all active work.
  const [shiftResult, activeResult] = await Promise.all([
    supabase
      .from("assignments")
      .select("*")
      .eq("hidden_from_admin_dashboard", false)
      .eq("shift_date", shiftDate)
      .eq("distribution_present", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("assignments")
      .select("*")
      .eq("hidden_from_admin_dashboard", false)
      .or('status.eq."In Progress",and(status.eq."Overdue",distribution_present.eq.true)')
      .order("created_at", { ascending: false }),
  ]);

  if (shiftResult.error) throw shiftResult.error;
  if (activeResult.error) throw activeResult.error;

  const uniqueAssignments = new Map<string, Database["public"]["Tables"]["assignments"]["Row"]>();
  for (const assignment of [...(shiftResult.data ?? []), ...(activeResult.data ?? [])]) {
    uniqueAssignments.set(assignment.id, assignment);
  }

  const assignments = [...uniqueAssignments.values()].sort((a, b) => {
    const shiftOrder = String(b.shift_date ?? "").localeCompare(String(a.shift_date ?? ""));
    if (shiftOrder !== 0) return shiftOrder;
    return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
  });

  return attachMatches(supabase, assignments);
}

/**
 * Collector dashboard query: current distribution and genuinely active work only.
 * Stale Overdue assignments whose Distribution rows were removed/reassigned are
 * hidden; In Progress work and recent completions remain visible. Older completed
 * assignments are retrieved through archive search.
 */
export async function getCollectorDashboardAssignmentsForShift(
  supabase: Client,
  collectorId: string,
  shiftDate: string
): Promise<AssignmentWithMatch[]> {
  const recentCompletionCutoff = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("assignments")
    .select("*")
    .eq("collector_id", collectorId)
    // Always include every assignment for the selected shift, including older
    // completed work. The previous 36-hour completion cutoff accidentally hid
    // completed assignments when the collector selected an older shift.
    // Outside that shift, load only live unfinished distribution rows, active
    // work, and recent completions. Older history remains on-demand in the archive.
    .or(`shift_date.eq.${shiftDate},and(distribution_present.eq.true,status.neq."Completed"),status.eq."In Progress",completed_at.gte.${recentCompletionCutoff}`)
    .order("shift_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return attachMatches(supabase, data ?? []);
}

/** Explicit archive lookup by Match ID; called only when an admin/collector searches. */
export async function searchHistoricalAssignmentsByMatchId(
  supabase: Client,
  query: string,
  collectorId?: string
): Promise<AssignmentWithMatch[]> {
  const normalizedQuery = query.trim().replace(/[,%_]/g, "");
  if (normalizedQuery.length < 2 || normalizedQuery.length > 80) return [];

  const { data: matches, error: matchesError } = await supabase
    .from("matches")
    .select("id, external_id")
    .ilike("external_id", `%${normalizedQuery}%`)
    .limit(50);

  if (matchesError) throw matchesError;
  const matchIds = (matches ?? []).map((match) => match.id);
  if (matchIds.length === 0) return [];

  let assignmentsQuery = supabase
    .from("assignments")
    .select("*")
    .in("match_id", matchIds)
    .order("created_at", { ascending: false })
    .limit(100);

  if (collectorId) {
    assignmentsQuery = assignmentsQuery.eq("collector_id", collectorId);
  }

  const { data: assignments, error: assignmentsError } = await assignmentsQuery;
  if (assignmentsError) throw assignmentsError;
  return attachMatches(supabase, assignments ?? []);
}

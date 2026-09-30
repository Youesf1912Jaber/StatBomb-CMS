import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssignmentTaskTimerRow, Database, MatchRow } from "@/types/database.types";
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
  for (let i = 0; i < matchIds.length; i += MATCH_ID_CHUNK_SIZE) {
    const chunk = matchIds.slice(i, i + MATCH_ID_CHUNK_SIZE);
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

    matches.push(...(data ?? []));
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

/** All assignments visible to the caller (admin — RLS allows this). */
export async function getAllAssignments(supabase: Client): Promise<AssignmentWithMatch[]> {
  const { data, error } = await supabase.from("assignments").select("*");
  if (error) throw error;
  return attachMatches(supabase, data ?? []);
}

/** Admin Dashboard assignments. Hidden rows remain in the database and history. */
export async function getAdminDashboardAssignments(supabase: Client): Promise<AssignmentWithMatch[]> {
  console.error("Admin dashboard query start", {
    query: "admin assignments query",
  });
  const { data, error } = await supabase
    .from("assignments")
    .select("*")
    .eq("hidden_from_admin_dashboard", false)
    .eq("distribution_present", true);
  if (error) {
    console.error("Admin dashboard query failed", {
      query: "admin assignments query",
      ...queryErrorFields(error),
    });
    throw error;
  }
  const assignments = data ?? [];
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

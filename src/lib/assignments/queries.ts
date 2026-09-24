import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssignmentTaskTimerRow, Database, MatchRow } from "@/types/database.types";
import type { AssignmentWithMatch } from "./types";

type Client = SupabaseClient<Database>;

/**
 * Nested `select("*, match:matches(*)")` typing doesn't infer well against
 * our hand-written Database type (empty `Relationships` — see
 * database.types.ts's regeneration note), so assignments and their
 * matches are fetched separately and joined in JS. Keeps the types honest
 * instead of casting through `any`.
 */
async function attachMatches(
  supabase: Client,
  assignments: Database["public"]["Tables"]["assignments"]["Row"][]
): Promise<AssignmentWithMatch[]> {
  if (assignments.length === 0) return [];

  const matchIds = [...new Set(assignments.map((a) => a.match_id))];
  const { data: matches, error } = await supabase
    .from("matches")
    .select("*")
    .in("id", matchIds);

  if (error) throw error;

  const byId = new Map<string, MatchRow>((matches ?? []).map((m) => [m.id, m]));

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
  const { data, error } = await supabase
    .from("assignments")
    .select("*")
    .eq("hidden_from_admin_dashboard", false);
  if (error) throw error;
  return attachMatches(supabase, data ?? []);
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

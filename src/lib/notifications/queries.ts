import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, NotificationRow } from "@/types/database.types";

type Client = SupabaseClient<Database>;

export type NotificationWithDetails = NotificationRow & {
  assignmentDetails: {
    assignmentId: string;
    matchLabel: string;
    competition: string | null;
    matchDate: string;
    task: string;
    half: string;
    status: string;
    sla: string;
    collectorName: string;
    collectorHrCode: string | null;
  } | null;
};

/**
 * The signed-in user's notifications, newest first, enriched with the
 * assignment's match and collector so SLA alerts explain exactly what is at risk.
 * RLS scopes the notification and assignment rows to the current user/admin.
 */
export async function getNotificationsForUser(
  supabase: Client,
  userId: string
): Promise<NotificationWithDetails[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", userId)
    .order("sent_at", { ascending: false });

  if (error) throw error;
  const notifications = data ?? [];
  const assignmentIds = [...new Set(
    notifications.map((notification) => notification.assignment_id).filter((id): id is string => id !== null)
  )];

  if (assignmentIds.length === 0) {
    return notifications.map((notification) => ({ ...notification, assignmentDetails: null }));
  }

  const { data: assignments, error: assignmentsError } = await supabase
    .from("assignments")
    .select("id, match_id, collector_id, task, half, status, sla")
    .in("id", assignmentIds);
  if (assignmentsError) throw assignmentsError;

  const assignmentRows = assignments ?? [];
  const matchIds = [...new Set(assignmentRows.map((assignment) => assignment.match_id))];
  const collectorIds = [...new Set(assignmentRows.map((assignment) => assignment.collector_id))];

  const [matchesResult, collectorsResult] = await Promise.all([
    matchIds.length
      ? supabase.from("matches").select("id, home_team, away_team, competition, match_date").in("id", matchIds)
      : Promise.resolve({ data: [], error: null }),
    collectorIds.length
      ? supabase.from("profiles").select("id, full_name, hr_code").in("id", collectorIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (matchesResult.error) throw matchesResult.error;
  if (collectorsResult.error) throw collectorsResult.error;

  const matchById = new Map((matchesResult.data ?? []).map((match) => [match.id, match]));
  const collectorById = new Map((collectorsResult.data ?? []).map((collector) => [collector.id, collector]));
  const assignmentById = new Map(assignmentRows.map((assignment) => [assignment.id, assignment]));

  return notifications.map((notification) => {
    const assignment = notification.assignment_id
      ? assignmentById.get(notification.assignment_id)
      : undefined;
    if (!assignment) return { ...notification, assignmentDetails: null };

    const match = matchById.get(assignment.match_id);
    const collector = collectorById.get(assignment.collector_id);
    return {
      ...notification,
      assignmentDetails: match
        ? {
            assignmentId: assignment.id,
            matchLabel: `${match.home_team} vs ${match.away_team}`,
            competition: match.competition,
            matchDate: match.match_date,
            task: assignment.task,
            half: assignment.half,
            status: assignment.status,
            sla: assignment.sla,
            collectorName: collector?.full_name?.trim() || "Unknown collector",
            collectorHrCode: collector?.hr_code ?? null,
          }
        : null,
    };
  });
}

/** Unread notification count for the bell badge (RLS-scoped to the user). */
export async function getUnreadNotificationCount(
  supabase: Client,
  userId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", userId)
    .is("read_at", null);

  if (error) throw error;
  return count ?? 0;
}

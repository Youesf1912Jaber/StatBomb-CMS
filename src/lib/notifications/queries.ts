import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, NotificationRow } from "@/types/database.types";

type Client = SupabaseClient<Database>;

/**
 * The signed-in user's notifications, newest first. RLS
 * (`notifications_owner_read`) already scopes rows to the recipient (or an
 * admin); the explicit `recipient_id` filter keeps this to "my own
 * notifications" for both roles and makes the intent clear.
 */
export async function getNotificationsForUser(
  supabase: Client,
  userId: string
): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", userId)
    .order("sent_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
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

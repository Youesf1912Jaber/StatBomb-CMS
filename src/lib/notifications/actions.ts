"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface NotificationActionState {
  error: string | null;
}

const OK: NotificationActionState = { error: null };

function revalidateNotificationViews() {
  revalidatePath("/collector/notifications");
  revalidatePath("/admin/notifications");
  revalidatePath("/collector", "layout");
  revalidatePath("/admin", "layout");
}

/**
 * Mark one of the caller's notifications read. Authorization is enforced by
 * RLS (`notifications_owner_update`: recipient-only) plus the explicit
 * `recipient_id` filter, so a crafted id can never touch another user's row.
 */
export async function markNotificationRead(notificationId: string): Promise<NotificationActionState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You need to be signed in to do that." };

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("recipient_id", user.id)
    .is("read_at", null);

  if (error) return { error: "Something went wrong. Please try again." };

  revalidateNotificationViews();
  return OK;
}

/** Mark every unread notification belonging to the caller as read. */
export async function markAllNotificationsRead(): Promise<NotificationActionState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You need to be signed in to do that." };

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", user.id)
    .is("read_at", null);

  if (error) return { error: "Something went wrong. Please try again." };

  revalidateNotificationViews();
  return OK;
}

/** Delete one notification belonging to the caller. */
export async function deleteNotification(notificationId: string): Promise<NotificationActionState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You need to be signed in to do that." };

  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", notificationId)
    .eq("recipient_id", user.id);

  if (error) return { error: "Something went wrong. Please try again." };

  revalidateNotificationViews();
  return OK;
}

/** Delete every notification belonging to the caller. */
export async function deleteAllNotifications(): Promise<NotificationActionState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You need to be signed in to do that." };

  const { error } = await supabase.from("notifications").delete().eq("recipient_id", user.id);

  if (error) return { error: "Something went wrong. Please try again." };

  revalidateNotificationViews();
  return OK;
}

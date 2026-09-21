"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface NotificationActionState {
  error: string | null;
}

const OK: NotificationActionState = { error: null };

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

  revalidatePath("/collector/notifications");
  revalidatePath("/admin/notifications");
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

  revalidatePath("/collector/notifications");
  revalidatePath("/admin/notifications");
  return OK;
}

import { createClient } from "@/lib/supabase/server";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import { getNotificationsForUser } from "@/lib/notifications/queries";
import { NotificationList } from "@/components/NotificationList";
import { ClearAllNotificationsButton, MarkAllAsReadButton } from "@/components/NotificationMarkButtons";

export default async function AdminNotificationsPage() {
  const profile = await getProfileOrRedirect();
  const supabase = createClient();
  const notifications = await getNotificationsForUser(supabase, profile.id);
  const unreadCount = notifications.filter((n) => n.read_at === null).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-chalk-50">Notifications</h1>
          <p className="mt-1 text-sm text-chalk-200">
            {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MarkAllAsReadButton disabled={unreadCount === 0} />
          <ClearAllNotificationsButton disabled={notifications.length === 0} />
        </div>
      </div>

      <NotificationList notifications={notifications} />
    </div>
  );
}

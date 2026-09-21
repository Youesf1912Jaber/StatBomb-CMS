import { redirect } from "next/navigation";
import { AppShell, type NavItem } from "@/components/AppShell";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import { createClient } from "@/lib/supabase/server";
import { getUnreadNotificationCount } from "@/lib/notifications/queries";

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/admin" },
  { label: "Match Master", href: "/admin/matches" },
  { label: "Match Master Preview", href: "/admin/matches/sync-preview" },
  { label: "Distribution Preview", href: "/admin/distribution/preview" },
  { label: "Sync Preview", href: "/admin/sync" },
  { label: "Collectors", href: "/admin/collectors" },
  { label: "Activity Log", href: "/admin/activity-log" },
  { label: "Notifications", href: "/admin/notifications" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfileOrRedirect();

  if (profile.role !== "admin") {
    redirect("/collector");
  }

  const supabase = createClient();
  const unreadCount = await getUnreadNotificationCount(supabase, profile.id);

  return (
    <AppShell
      roleLabel="Admin"
      userLabel={profile.full_name ?? profile.email}
      navItems={NAV_ITEMS}
      notificationsHref="/admin/notifications"
      unreadCount={unreadCount}
      vapidPublicKey={process.env.VAPID_PUBLIC_KEY ?? null}
    >
      {children}
    </AppShell>
  );
}

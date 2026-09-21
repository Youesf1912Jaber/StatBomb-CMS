import { redirect } from "next/navigation";
import { AppShell, type NavItem } from "@/components/AppShell";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import { createClient } from "@/lib/supabase/server";
import { getUnreadNotificationCount } from "@/lib/notifications/queries";

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/collector" },
  { label: "Notifications", href: "/collector/notifications" },
  { label: "Account Settings", href: "/collector/settings" },
];

export default async function CollectorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfileOrRedirect();

  if (profile.role !== "collector") {
    redirect("/admin");
  }

  if (profile.deleted_at || profile.suspended_at) {
    return children;
  }

  const supabase = createClient();
  const unreadCount = await getUnreadNotificationCount(supabase, profile.id);

  return (
    <AppShell
      roleLabel="Collector"
      userLabel={profile.full_name ?? profile.email}
      navItems={NAV_ITEMS}
      notificationsHref="/collector/notifications"
      unreadCount={unreadCount}
      vapidPublicKey={process.env.VAPID_PUBLIC_KEY ?? null}
    >
      {children}
    </AppShell>
  );
}

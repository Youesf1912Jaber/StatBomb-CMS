import { redirect } from "next/navigation";
import { AppShell, type NavItem } from "@/components/AppShell";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import { getSlaAlertItems } from "@/lib/assignments/sla-alert-queries";
import { createClient } from "@/lib/supabase/server";
import { getUnreadNotificationCount } from "@/lib/notifications/queries";

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/admin" },
  { label: "Match Master", href: "/admin/matches" },
  { label: "Match Master Preview", href: "/admin/matches/sync-preview" },
  { label: "Shift Analysis", href: "/admin/shift-analysis" },
  { label: "Collectors", href: "/admin/collectors" },
  { label: "Deductions", href: "/admin/deductions" },
  { label: "Bonus", href: "/admin/bonus" },
  { label: "Expected", href: "/admin/expected" },
  { label: "Over Target", href: "/admin/over-target" },
  { label: "Scorecard", href: "/admin/scorecard" },
  { label: "Links", href: "/admin/links" },
  { label: "Activity Log", href: "/admin/activity-log" },
  { label: "Notifications", href: "/admin/notifications" },
  { label: "Account Settings", href: "/collector/settings" },
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
  const [unreadCount, slaAlertAssignments] = await Promise.all([
    getUnreadNotificationCount(supabase, profile.id),
    getSlaAlertItems(supabase, "admin"),
  ]);

  return (
    <AppShell
      roleLabel="Admin"
      userLabel={profile.full_name ?? profile.email}
      navItems={NAV_ITEMS}
      notificationsHref="/admin/notifications"
      unreadCount={unreadCount}
      role="admin"
      canSwitchWorkspace={profile.role === "admin"}
      profileId={profile.id}
      slaAlertAssignments={slaAlertAssignments}
    >
      {children}
    </AppShell>
  );
}

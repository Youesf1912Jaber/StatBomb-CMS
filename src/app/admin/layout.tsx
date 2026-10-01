import { redirect } from "next/navigation";
import { AppShell, type NavItem } from "@/components/AppShell";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import { getAdminDashboardAssignments } from "@/lib/assignments/queries";
import { toSlaAlertItems } from "@/lib/assignments/sla-alarm";
import { createClient } from "@/lib/supabase/server";
import { getUnreadNotificationCount } from "@/lib/notifications/queries";

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/admin" },
  { label: "Match Master", href: "/admin/matches" },
  { label: "Match Master Preview", href: "/admin/matches/sync-preview" },
  { label: "Distribution Preview", href: "/admin/distribution/preview" },
  { label: "Sync Preview", href: "/admin/sync" },
  { label: "Collectors", href: "/admin/collectors" },
  { label: "Deductions", href: "/admin/deductions" },
  { label: "FF Shots", href: "/admin/ff-shots" },
  { label: "Bonus", href: "/admin/bonus" },
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
  const assignments = await getAdminDashboardAssignments(supabase);

  const collectorIds = [...new Set(assignments.map((assignment) => assignment.collector_id))];
  const collectorNames: Record<string, string> = {};
  if (collectorIds.length > 0) {
    const { data: collectors } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", collectorIds);
    for (const collector of collectors ?? []) {
      collectorNames[collector.id] = collector.full_name ?? collector.email;
    }
  }

  const slaAlertAssignments = toSlaAlertItems(
    assignments,
    (collectorId) => collectorNames[collectorId] ?? "Unknown collector"
  );

  return (
    <AppShell
      roleLabel="Admin"
      userLabel={profile.full_name ?? profile.email}
      navItems={NAV_ITEMS}
      notificationsHref="/admin/notifications"
      unreadCount={unreadCount}
      role="admin"
      profileId={profile.id}
      slaAlertAssignments={slaAlertAssignments}
    >
      {children}
    </AppShell>
  );
}

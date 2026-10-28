import { redirect } from "next/navigation";
import { AppShell, type NavItem } from "@/components/AppShell";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import { getAdminSlaAlertAssignments } from "@/lib/assignments/queries";
import { toSlaAlertItems } from "@/lib/assignments/sla-alarm";
import { createClient } from "@/lib/supabase/server";
import { getUnreadNotificationCount } from "@/lib/notifications/queries";

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/admin" },
  { label: "Match Master", href: "/admin/matches" },
  { label: "Match Master Preview", href: "/admin/matches/sync-preview" },
  { label: "Collectors", href: "/admin/collectors" },
  { label: "Deductions", href: "/admin/deductions" },
  { label: "Bonus", href: "/admin/bonus" },
  { label: "Expected", href: "/admin/expected" },
  { label: "Over Target", href: "/admin/over-target" },
  { label: "Scorecard", href: "/admin/scorecard" },
  { label: "Shift Analysis", href: "/admin/shift-analysis" },
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
  const [unreadCount, assignments] = await Promise.all([
    getUnreadNotificationCount(supabase, profile.id),
    getAdminSlaAlertAssignments(supabase),
  ]);

  // The shared layout needs only live, non-completed assignments for SLA
  // alerts. Historical completed work belongs to the dashboard/archive view.
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
      canSwitchWorkspace={profile.role === "admin"}
      profileId={profile.id}
      slaAlertAssignments={slaAlertAssignments}
    >
      {children}
    </AppShell>
  );
}

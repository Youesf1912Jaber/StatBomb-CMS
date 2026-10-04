import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell, type NavItem } from "@/components/AppShell";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import { getAssignmentsForCollector } from "@/lib/assignments/queries";
import { toSlaAlertItems, type SlaAlertAssignment } from "@/lib/assignments/sla-alarm";
import { createClient } from "@/lib/supabase/server";
import { getUnreadNotificationCount } from "@/lib/notifications/queries";

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/collector" },
  { label: "My Deductions", href: "/collector/deductions" },
  { label: "My FF Shots", href: "/collector/ff-shots" },
  { label: "Bonus", href: "/collector/bonus" },
  { label: "Expected", href: "/collector/expected" },
  { label: "Notifications", href: "/collector/notifications" },
  { label: "Account Settings", href: "/collector/settings" },
];

function isCollectorNotificationsPath(pathname: string): boolean {
  return (
    pathname === "/collector/notifications" ||
    pathname.startsWith("/collector/notifications/")
  );
}

async function loadSlaAlertAssignments(
  supabase: ReturnType<typeof createClient>,
  collectorId: string,
  collectorName: string
): Promise<SlaAlertAssignment[]> {
  const pathname = headers().get("x-pathname") ?? "";
  if (isCollectorNotificationsPath(pathname)) {
    return [];
  }

  const assignments = await getAssignmentsForCollector(supabase, collectorId);
  return toSlaAlertItems(assignments, () => collectorName);
}

export default async function CollectorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfileOrRedirect();

  if (profile.role !== "collector" && profile.role !== "admin") {
    redirect("/admin");
  }

  if (profile.deleted_at || profile.suspended_at) {
    return children;
  }

  const supabase = createClient();
  const unreadCount = await getUnreadNotificationCount(supabase, profile.id);
  const collectorName = profile.full_name ?? profile.email;
  const slaAlertAssignments = await loadSlaAlertAssignments(
    supabase,
    profile.id,
    collectorName
  );

  return (
    <AppShell
      roleLabel="Collector"
      userLabel={profile.full_name ?? profile.email}
      navItems={NAV_ITEMS}
      notificationsHref="/collector/notifications"
      unreadCount={unreadCount}
      role="collector"
      profileId={profile.id}
      slaAlertAssignments={slaAlertAssignments}
    >
      {children}
    </AppShell>
  );
}

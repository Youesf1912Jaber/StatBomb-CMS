import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "./SignOutButton";
import { NotificationBell } from "./NotificationBell";
import { GlobalSlaAlerts } from "./GlobalSlaAlerts";
import { ThemeToggle } from "./ThemeToggle";
import type { SlaAlertAssignment } from "@/lib/assignments/sla-alarm";

export interface NavItem {
  label: string;
  href: string;
}

interface AppShellProps {
  roleLabel: string;
  userLabel: string;
  navItems: NavItem[];
  /** Where the bell links to (role-scoped notifications page). */
  notificationsHref: string;
  /** Unread notification count for the bell badge. */
  unreadCount: number;
  /** Current authenticated user's role and ID scope SLA monitoring. */
  role: "admin" | "collector";
  profileId: string;
  /** Active assignments visible through the existing role-specific queries. */
  slaAlertAssignments: SlaAlertAssignment[];
  children: ReactNode;
}

export function AppShell({
  roleLabel,
  userLabel,
  navItems,
  notificationsHref,
  unreadCount,
  role,
  profileId,
  slaAlertAssignments,
  children,
}: AppShellProps) {
  return (
    <div className="min-h-screen lg:flex">
      <GlobalSlaAlerts
        assignments={slaAlertAssignments}
        role={role}
        profileId={profileId}
        collectorName={userLabel}
      />
      <aside className="hidden w-56 shrink-0 flex-col border-r border-pitch-700 bg-pitch-900 px-4 py-6 lg:flex">
        <div className="mb-8 flex items-start justify-between gap-2 px-2">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-pitch-500">
              StatBomb
            </p>
            <p className="mt-1 font-display text-lg text-chalk-50">Console</p>
          </div>
          <NotificationBell href={notificationsHref} unreadCount={unreadCount} />
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-[8px] px-3 py-2 text-sm text-chalk-200 transition-colors hover:bg-pitch-800 hover:text-chalk-50"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-pitch-700 pt-4">
          <p className="truncate text-sm text-chalk-50">{userLabel}</p>
          <p className="font-mono text-xs uppercase tracking-wide text-pitch-500">
            {roleLabel}
          </p>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-pitch-700 bg-pitch-900 px-4 py-3 lg:justify-end">
          <div className="min-w-0 lg:hidden">
            <p className="font-mono text-[10px] uppercase tracking-widest text-pitch-500">
              StatBomb
            </p>
            <p className="font-display text-base text-chalk-50">Console</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="lg:hidden">
              <NotificationBell href={notificationsHref} unreadCount={unreadCount} />
            </div>
            <span className="hidden font-mono text-xs uppercase tracking-wide text-pitch-500 sm:inline lg:hidden">
              {roleLabel}
            </span>
            <ThemeToggle />
            <SignOutButton />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

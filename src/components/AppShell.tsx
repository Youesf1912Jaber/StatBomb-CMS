import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "./SignOutButton";
import { NotificationBell } from "./NotificationBell";
import { GlobalSlaAlerts } from "./GlobalSlaAlerts";
import { ThemeToggle } from "./ThemeToggle";
import { MobileNav } from "./MobileNav";
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
  canSwitchWorkspace: boolean;
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
  canSwitchWorkspace,
  profileId,
  slaAlertAssignments,
  children,
}: AppShellProps) {
  return (
    <>
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        {role === "collector" ? (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-[0.10]"
            style={{ backgroundImage: 'url("/images/football/pitch-background-dark.webp")' }}
          />
        ) : null}
        {role !== "collector" ? (
          <svg
            viewBox="0 0 1600 1000"
            preserveAspectRatio="xMidYMid slice"
            className="absolute h-full w-full text-pitch-600 opacity-[0.22]"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <rect x="38" y="38" width="1524" height="924" rx="8" />
            <path d="M800 38V962" />
            <circle cx="800" cy="500" r="148" />
            <circle cx="800" cy="500" r="4" fill="currentColor" stroke="none" />
            <rect x="38" y="290" width="202" height="420" />
            <rect x="38" y="390" width="76" height="220" />
            <path d="M240 390 A112 112 0 0 1 240 610" />
            <rect x="1360" y="290" width="202" height="420" />
            <rect x="1486" y="390" width="76" height="220" />
            <path d="M1360 390 A112 112 0 0 0 1360 610" />
            <path d="M38 76 A38 38 0 0 0 76 38" />
            <path d="M1524 38 A38 38 0 0 0 1562 76" />
            <path d="M38 924 A38 38 0 0 0 76 962" />
            <path d="M1524 962 A38 38 0 0 0 1562 924" />
          </svg>
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-pitch-950/20 via-transparent to-pitch-950/20" />
      </div>
      <div className="relative z-10 min-h-screen lg:flex">
      <GlobalSlaAlerts
        assignments={slaAlertAssignments}
        role={role}
        profileId={profileId}
        collectorName={userLabel}
      />
      <aside className="relative z-20 sticky top-0 hidden h-screen w-56 shrink-0 flex-col overflow-y-auto border-r border-[#1b655a] bg-[#032b27] px-4 py-6 shadow-[10px_0_34px_rgba(0,0,0,0.32)] lg:flex">
        <div className="mb-8 flex items-start justify-between gap-2 border-b border-[#1b655a] px-2 pb-5">
          <div>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[#79c8b6]">
              StatBomb
            </p>
            <p className="mt-1 font-display text-xl text-white">Console</p>
          </div>
          <NotificationBell href={notificationsHref} unreadCount={unreadCount} />
        </div>
        <nav className="flex flex-1 flex-col gap-1.5">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg border border-transparent px-3 py-2.5 text-[13px] font-medium text-[#e0eee9] transition-colors hover:border-[#287568] hover:bg-[#0b4940] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c36b]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-5 border-t border-[#1b655a] px-2 pt-4">
          <p className="truncate text-sm font-semibold text-white">{userLabel}</p>
          <p className="mt-1 font-mono text-xs uppercase tracking-[0.14em] text-[#65b8a7]">
            {roleLabel}
          </p>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-pitch-700 bg-pitch-900 px-4 py-3 lg:justify-end">
          <div className="flex min-w-0 items-center gap-3 lg:hidden">
            <MobileNav
              roleLabel={roleLabel}
              userLabel={userLabel}
              navItems={navItems}
              notificationsHref={notificationsHref}
              unreadCount={unreadCount}
            />
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-widest text-pitch-500">
                StatBomb
              </p>
              <p className="font-display text-base text-chalk-50">Console</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="lg:hidden">
              <NotificationBell href={notificationsHref} unreadCount={unreadCount} />
            </div>
            <span className="hidden font-mono text-xs uppercase tracking-wide text-pitch-500 sm:inline lg:hidden">
              {roleLabel}
            </span>
            {canSwitchWorkspace ? (
              <Link
                href={role === "admin" ? "/collector" : "/admin"}
                title={role === "admin" ? "Switch to Collector workspace" : "Switch to Admin workspace"}
                className="inline-flex items-center gap-2 rounded-[8px] border border-[#287568] bg-[#063b35] px-3 py-1.5 text-sm font-medium text-[#d9eee8] shadow-sm transition-colors hover:border-[#e3c36b] hover:bg-[#0b4940] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c36b]"
              >
                <span aria-hidden="true">⇄</span>
                <span className="hidden sm:inline">{role === "admin" ? "Collector" : "Admin"}</span>
                <span className="sm:hidden">{role === "admin" ? "COL" : "ADM"}</span>
              </Link>
            ) : null}
            <ThemeToggle />
            <SignOutButton />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
    </>
  );
}

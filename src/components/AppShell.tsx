import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "./SignOutButton";
import { NotificationBell } from "./NotificationBell";
import { PushNotificationSetup } from "./PushNotificationSetup";
import { GlobalSlaWarningAlarms } from "./GlobalSlaWarningAlarms";
import type { SlaWarningAlarmProps } from "./SlaWarningAlarm";

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
  /** VAPID *public* key for browser push; null disables the push prompt. */
  vapidPublicKey: string | null;
  /** Active assignments for the global SLA warning audio alarm. */
  slaAlarmAssignments: SlaWarningAlarmProps[];
  children: ReactNode;
}

export function AppShell({
  roleLabel,
  userLabel,
  navItems,
  notificationsHref,
  unreadCount,
  vapidPublicKey,
  slaAlarmAssignments,
  children,
}: AppShellProps) {
  return (
    <div className="min-h-screen lg:flex">
      <GlobalSlaWarningAlarms assignments={slaAlarmAssignments} />
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
          <div className="mb-3">
            <PushNotificationSetup vapidPublicKey={vapidPublicKey} />
          </div>
          <p className="truncate text-sm text-chalk-50">{userLabel}</p>
          <p className="mb-3 font-mono text-xs uppercase tracking-wide text-pitch-500">
            {roleLabel}
          </p>
          <SignOutButton />
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-pitch-700 bg-pitch-900 px-4 py-3 lg:hidden">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-pitch-500">
              StatBomb
            </p>
            <p className="font-display text-base text-chalk-50">Console</p>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell href={notificationsHref} unreadCount={unreadCount} />
            <span className="font-mono text-xs uppercase tracking-wide text-pitch-500">
              {roleLabel}
            </span>
            <SignOutButton />
          </div>
        </header>

        <div className="px-4 pt-4 lg:hidden">
          <PushNotificationSetup vapidPublicKey={vapidPublicKey} />
        </div>

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

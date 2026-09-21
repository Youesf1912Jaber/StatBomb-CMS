import Link from "next/link";

interface NotificationBellProps {
  href: string;
  unreadCount: number;
}

/**
 * Bell icon with an unread badge. Server-rendered — the count is fetched per
 * request by the layout, so it refreshes on navigation and after mark-read
 * actions call router.refresh().
 */
export function NotificationBell({ href, unreadCount }: NotificationBellProps) {
  return (
    <Link
      href={href}
      aria-label={
        unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"
      }
      className="relative inline-flex items-center justify-center rounded-[8px] border border-pitch-700 p-2 text-chalk-200 transition-colors hover:border-clock-amber hover:text-chalk-50"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
        aria-hidden="true"
      >
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>
      {unreadCount > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-clock-red px-1 font-mono text-[11px] font-semibold text-chalk-50">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Link>
  );
}

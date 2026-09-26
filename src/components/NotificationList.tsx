import type { NotificationRow, NotificationType } from "@/types/database.types";
import { formatCairoDateTime } from "@/lib/dates";
import { DeleteNotificationButton, MarkAsReadButton } from "./NotificationMarkButtons";

/** Accent + label per notification type (only SLA types exist in Step 2). */
const TYPE_STYLE: Record<NotificationType, { accent: string; label: string }> = {
  sla_warning: { accent: "text-clock-amber", label: "SLA warning" },
  assignment_overdue: { accent: "text-clock-red", label: "Overdue" },
  assignment_created: { accent: "text-chalk-200", label: "Assignment created" },
  assignment_reassigned: { accent: "text-chalk-200", label: "Reassigned" },
  assignment_started: { accent: "text-chalk-200", label: "Started" },
  assignment_completed: { accent: "text-chalk-200", label: "Completed" },
};

function NotificationItem({ n }: { n: NotificationRow }) {
  const unread = n.read_at === null;
  const style = TYPE_STYLE[n.type];

  return (
    <li
      className={`rounded-card border bg-pitch-900 px-4 py-3 ${
        unread ? "border-clock-amber" : "border-pitch-700"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
            unread ? "bg-clock-amber" : "bg-pitch-600"
          }`}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="text-sm font-semibold text-chalk-50">{n.title}</p>
            <p className={`font-mono text-[11px] uppercase tracking-wide ${style.accent}`}>
              {style.label}
            </p>
          </div>
          <p className="mt-1 text-sm text-chalk-200">{n.message}</p>
          <p className="mt-1 font-mono text-xs text-pitch-500">
            {formatCairoDateTime(n.sent_at)}
            {unread ? " · Unread" : " · Read"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {unread && <MarkAsReadButton notificationId={n.id} />}
            <DeleteNotificationButton notificationId={n.id} />
          </div>
        </div>
      </div>
    </li>
  );
}

export function NotificationList({ notifications }: { notifications: NotificationRow[] }) {
  if (notifications.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-pitch-700 px-4 py-10 text-center text-sm text-chalk-200">
        No notifications yet.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {notifications.map((n) => (
        <NotificationItem key={n.id} n={n} />
      ))}
    </ul>
  );
}

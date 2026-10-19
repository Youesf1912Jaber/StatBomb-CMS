import Link from "next/link";
import type { NotificationType } from "@/types/database.types";
import type { NotificationWithDetails } from "@/lib/notifications/queries";
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

function NotificationItem({ n, detailsBasePath }: { n: NotificationWithDetails; detailsBasePath: string }) {
  const unread = n.read_at === null;
  const style = TYPE_STYLE[n.type];
  const details = n.assignmentDetails;

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

          {details && (
            <Link
              href={detailsBasePath + "/" + details.assignmentId}
              aria-label={"Open assignment for " + details.matchLabel}
              className="mt-3 block space-y-2 rounded-lg border border-pitch-700 bg-pitch-950/60 p-3 transition-colors hover:border-clock-amber hover:bg-pitch-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clock-amber"
            >
              <div>
                <p className="text-[11px] uppercase tracking-wide text-pitch-400">Match</p>
                <p className="mt-0.5 text-sm font-semibold text-chalk-50">{details.matchLabel}</p>
                {details.competition && (
                  <p className="text-xs text-chalk-200">{details.competition}</p>
                )}
                <p className="text-xs text-pitch-400">Match date: {details.matchDate}</p>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-pitch-400">Collector</p>
                  <p className="text-sm text-chalk-100">{details.collectorName}</p>
                  {details.collectorHrCode && (
                    <p className="text-xs text-pitch-400">HR-Code: {details.collectorHrCode}</p>
                  )}
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-pitch-400">Task / Half</p>
                  <p className="text-sm text-chalk-100">{details.task} · {details.half}</p>
                  <p className="text-xs text-pitch-400">Status: {details.status}</p>
                </div>
              </div>
              <p className="text-xs text-chalk-200">
                SLA deadline: <span className="font-mono">{formatCairoDateTime(details.sla)}</span>
              </p>
              <p className="flex items-center gap-1 text-xs font-semibold text-clock-amber">
                Open match / assignment <span aria-hidden="true">→</span>
              </p>
            </Link>
          )}

          <p className="mt-2 font-mono text-xs text-pitch-500">
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

export function NotificationList({ notifications, detailsBasePath }: { notifications: NotificationWithDetails[]; detailsBasePath: string }) {
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
        <NotificationItem key={n.id} n={n} detailsBasePath={detailsBasePath} />
      ))}
    </ul>
  );
}

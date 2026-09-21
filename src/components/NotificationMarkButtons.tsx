"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/notifications/actions";

/** Single notification "Mark as read" button (only rendered while unread). */
export function MarkAsReadButton({ notificationId }: { notificationId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handle() {
    setError(null);
    startTransition(async () => {
      const result = await markNotificationRead(notificationId);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="mt-2">
      <button
        onClick={handle}
        disabled={isPending}
        className="rounded-[8px] border border-pitch-700 px-3 py-1 text-xs text-chalk-200 transition-colors hover:border-clock-amber hover:text-chalk-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Marking…" : "Mark as read"}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-clock-red">
          {error}
        </p>
      )}
    </div>
  );
}

/** "Mark all as read" control for the top of the notifications list. */
export function MarkAllAsReadButton({ disabled }: { disabled?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handle() {
    setError(null);
    startTransition(async () => {
      const result = await markAllNotificationsRead();
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div>
      <button
        onClick={handle}
        disabled={isPending || disabled}
        className="rounded-[8px] border border-pitch-700 px-3 py-1.5 text-sm text-chalk-200 transition-colors hover:border-clock-amber hover:text-chalk-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Marking…" : "Mark all as read"}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-clock-red">
          {error}
        </p>
      )}
    </div>
  );
}

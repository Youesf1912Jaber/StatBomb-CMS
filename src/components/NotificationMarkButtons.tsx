"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  deleteAllNotifications,
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
    <div>
      <button
        type="button"
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

/** Single notification delete control. */
export function DeleteNotificationButton({ notificationId }: { notificationId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handle() {
    setError(null);
    startTransition(async () => {
      const result = await deleteNotification(notificationId);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={handle}
        disabled={isPending}
        className="rounded-[8px] border border-pitch-700 px-3 py-1 text-xs text-chalk-200 transition-colors hover:border-clock-red hover:text-clock-red disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Deleting…" : "Delete"}
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
        type="button"
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

/** "Clear all" control with a confirmation step before deleting. */
export function ClearAllNotificationsButton({ disabled }: { disabled?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function cancel() {
    if (isPending) return;
    setConfirming(false);
    setError(null);
  }

  function runDeleteAll() {
    setError(null);
    startTransition(async () => {
      const result = await deleteAllNotifications();
      if (result.error) {
        setError(result.error);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
        disabled={isPending || disabled}
        className="rounded-[8px] border border-pitch-700 px-3 py-1.5 text-sm text-chalk-200 transition-colors hover:border-clock-red hover:text-clock-red disabled:cursor-not-allowed disabled:opacity-60"
      >
        Clear all
      </button>
      {error && !confirming && (
        <p role="alert" className="mt-1 text-xs text-clock-red">
          {error}
        </p>
      )}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-w-md space-y-4 rounded-card border border-pitch-700 bg-pitch-900 p-6 shadow-xl">
            <p className="text-sm text-chalk-50">Are you sure you want to delete all notifications?</p>
            {error && (
              <p role="alert" className="text-xs text-clock-red">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={cancel}
                disabled={isPending}
                className="rounded-card border border-pitch-700 px-4 py-2 text-sm text-chalk-50 hover:border-clock-amber disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runDeleteAll}
                disabled={isPending}
                className="rounded-card bg-clock-red px-4 py-2 text-sm font-semibold text-chalk-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "Deleting…" : "Delete all"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

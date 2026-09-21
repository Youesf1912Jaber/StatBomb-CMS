import "server-only";
import webpush, { type WebPushError } from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, NotificationType } from "@/types/database.types";

/**
 * Server-side Web Push (VAPID). The private key is read from a server-only
 * env var and never leaves this module; only the public key is ever handed to
 * the browser (via a prop from the layout).
 *
 * Push is an *additional* sender on top of the in-app `notifications` rows —
 * per the final spec §2, delivery failures here are caught and logged and must
 * never break the in-app path.
 */

/** Pluggable sender shape from spec §2 (Email/Telegram/Slack plug in later). */
export interface NotificationSender {
  send(notification: {
    recipientId: string;
    type: NotificationType;
    title: string;
    message: string;
  }): Promise<void>;
}

type ServiceClient = SupabaseClient<Database>;

let vapidConfigured = false;

/**
 * Configures VAPID once per process. Returns false when keys are absent, so
 * push degrades to a no-op instead of throwing and taking the scanner down.
 */
function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@statbomb.local";

  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

/** A dead subscription — the browser/endpoint is gone for good. */
function isGoneStatus(status: number | undefined): boolean {
  return status === 404 || status === 410;
}

/**
 * Sends one payload to every registered endpoint of one recipient.
 * Expired/invalid subscriptions (404/410) are deleted so they stop being
 * retried; other failures are logged and skipped.
 */
async function sendToRecipient(
  serviceClient: ServiceClient,
  recipientId: string,
  payload: { title: string; message: string; type: NotificationType; assignmentId: string | null }
): Promise<{ sent: number; removed: number; failed: number }> {
  const { data: subscriptions, error } = await serviceClient
    .from("push_subscriptions")
    .select("*")
    .eq("profile_id", recipientId);

  if (error) {
    console.error("[push] failed to load subscriptions", {
      recipientId,
      message: error.message,
    });
    return { sent: 0, removed: 0, failed: 0 };
  }

  let sent = 0;
  let removed = 0;
  let failed = 0;

  for (const sub of subscriptions ?? []) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth_key },
        },
        JSON.stringify(payload)
      );
      sent += 1;
    } catch (cause) {
      const status = (cause as WebPushError)?.statusCode;

      if (isGoneStatus(status)) {
        // Permission revoked or browser profile gone — prune it.
        const { error: deleteError } = await serviceClient
          .from("push_subscriptions")
          .delete()
          .eq("id", sub.id);

        if (deleteError) {
          console.error("[push] failed to prune dead subscription", {
            subscriptionId: sub.id,
            message: deleteError.message,
          });
        } else {
          removed += 1;
        }
        continue;
      }

      failed += 1;
      console.error("[push] send failed", {
        subscriptionId: sub.id,
        status,
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  return { sent, removed, failed };
}

/** WebPushSender from spec §2, for one-off sends outside the scanner. */
export class WebPushSender implements NotificationSender {
  constructor(private readonly serviceClient: ServiceClient) {}

  async send(notification: {
    recipientId: string;
    type: NotificationType;
    title: string;
    message: string;
  }): Promise<void> {
    if (!ensureVapidConfigured()) return;

    await sendToRecipient(this.serviceClient, notification.recipientId, {
      title: notification.title,
      message: notification.message,
      type: notification.type,
      assignmentId: null,
    });
  }
}

export interface PushDispatchResult {
  notificationsConsidered: number;
  pushesSent: number;
  subscriptionsRemoved: number;
  failures: number;
  skipped: boolean;
}

/**
 * Fans the SLA scanner's freshly-inserted notification rows out to Browser
 * Push. Called by /api/cron/sla-scan immediately after
 * evaluate_assignment_sla_states().
 *
 * Recipients need no special handling here: migration 0004 already inserts one
 * notification row for the affected collector *and* one per admin, so pushing
 * every unpushed row automatically reaches exactly the right people.
 *
 * Idempotency: rows are claimed by stamping `pushed_at`, so a row is pushed at
 * most once even if the cron double-fires, and a run that dies mid-way leaves
 * the remaining rows for the next tick — the same downtime-safe property the
 * SQL scanner has.
 */
export async function dispatchPendingPushNotifications(
  serviceClient: ServiceClient,
  limit = 200
): Promise<PushDispatchResult> {
  const empty: PushDispatchResult = {
    notificationsConsidered: 0,
    pushesSent: 0,
    subscriptionsRemoved: 0,
    failures: 0,
    skipped: false,
  };

  if (!ensureVapidConfigured()) {
    console.warn("[push] VAPID keys not configured — skipping push fan-out");
    return { ...empty, skipped: true };
  }

  const { data: pending, error } = await serviceClient
    .from("notifications")
    .select("*")
    .is("pushed_at", null)
    .order("sent_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[push] failed to load pending notifications", {
      message: error.message,
    });
    return empty;
  }

  if (!pending || pending.length === 0) return empty;

  let pushesSent = 0;
  let subscriptionsRemoved = 0;
  let failures = 0;

  for (const notification of pending) {
    const result = await sendToRecipient(serviceClient, notification.recipient_id, {
      title: notification.title,
      message: notification.message,
      type: notification.type,
      assignmentId: notification.assignment_id,
    });

    pushesSent += result.sent;
    subscriptionsRemoved += result.removed;
    failures += result.failed;

    // Stamped regardless of outcome: a recipient with no subscription (or a
    // permanently failing one) must not be retried forever. The in-app
    // notification is already delivered either way.
    const { error: markError } = await serviceClient
      .from("notifications")
      .update({ pushed_at: new Date().toISOString() })
      .eq("id", notification.id);

    if (markError) {
      console.error("[push] failed to mark notification pushed", {
        notificationId: notification.id,
        message: markError.message,
      });
    }
  }

  return {
    notificationsConsidered: pending.length,
    pushesSent,
    subscriptionsRemoved,
    failures,
    skipped: false,
  };
}

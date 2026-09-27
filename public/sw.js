/*
 * StatBomb push service worker.
 *
 * Kept deliberately minimal: it displays pushes that arrive while the tab is
 * closed and focuses/opens the notifications page on click. No caching or
 * offline behaviour — this app is data-live and must never serve stale
 * assignment/SLA state from a cache.
 */

function hasStopAlarmAction(notification) {
  const actions = notification.actions || [];
  return actions.some((action) => action.action === "stop-alarm");
}

function closeLegacySlaWarningNotifications() {
  return self.registration.getNotifications().then((notifications) => {
    notifications.forEach((notification) => {
      if (notification.title !== "SLA Warning") return;
      if (hasStopAlarmAction(notification)) return;
      notification.close();
    });
  });
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([self.clients.claim(), closeLegacySlaWarningNotifications()])
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || "StatBomb";
  const body = payload.message || "You have a new notification.";
  const type = payload.type || "notification";
  const assignmentId = payload.assignmentId || null;
  const isSlaWarning = type === "sla_warning" || type === "sla_warning_alarm";
  const tag =
    isSlaWarning && assignmentId
      ? "sla-warning:" + assignmentId
      : (assignmentId || "general") + ":" + type;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      renotify: !isSlaWarning,
      requireInteraction: isSlaWarning,
      data: { type: type, assignmentId: assignmentId },
      actions: isSlaWarning ? [{ action: "stop-alarm", title: "Stop Alarm" }] : [],
    })
  );
});

function notifyClientsToStopAlarm(assignmentId) {
  if (typeof assignmentId !== "string" || assignmentId.length === 0) {
    return Promise.resolve();
  }

  const message = { type: "sla-stop-alarm", assignmentId: assignmentId };

  try {
    const channel = new BroadcastChannel("sla-warning-alarm");
    channel.postMessage(message);
    channel.close();
  } catch {
    // BroadcastChannel is optional; client.postMessage below is the fallback.
  }

  return self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((allClients) => {
      allClients.forEach((client) => {
        client.postMessage(message);
      });
    });
}

self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  event.notification.close();

  if (event.action === "stop-alarm") {
    event.waitUntil(notifyClientsToStopAlarm(data.assignmentId));
    return;
  }

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Focus an already-open app tab if there is one.
      for (const client of allClients) {
        if ("focus" in client) {
          await client.focus();
          return;
        }
      }

      // Otherwise open the app root; middleware routes the user to the
      // correct role area, so the SW needs no role knowledge.
      if (self.clients.openWindow) {
        await self.clients.openWindow("/");
      }
    })()
  );
});

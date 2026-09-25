/*
 * StatBomb push service worker.
 *
 * Kept deliberately minimal: it displays pushes that arrive while the tab is
 * closed and focuses/opens the notifications page on click. No caching or
 * offline behaviour — this app is data-live and must never serve stale
 * assignment/SLA state from a cache.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      // Collapse repeat pushes for the same assignment+type instead of
      // stacking duplicates when the scanner retries.
      tag: (payload.assignmentId || "general") + ":" + type,
      renotify: true,
      data: { type: type, assignmentId: payload.assignmentId || null },
    })
  );
});

function notifyClientsToStopAlarm(assignmentId) {
  const message = { type: "sla-stop-alarm", assignmentId: assignmentId || null };

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
    event.waitUntil(notifyClientsToStopAlarm(data.assignmentId || null));
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

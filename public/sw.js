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

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

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

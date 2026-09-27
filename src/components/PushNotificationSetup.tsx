"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Browser push permission + subscription flow.
 *
 * Renders nothing once push is active (or unsupported), so it doesn't disturb
 * the existing notification UI. The VAPID *public* key arrives as a prop from
 * the server layout — the private key stays server-side.
 */

type PushState = "unsupported" | "loading" | "prompt" | "enabled" | "denied";
const SERVICE_WORKER_URL = "/sw.js";
const SERVICE_WORKER_SCOPE = "/";
const PUSH_INSTALLATION_ID_KEY = "push-installation-id";
const PUSH_ENDPOINT_KEY_PREFIX = "push-endpoint";

/** VAPID keys are base64url; the Push API wants a Uint8Array. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

function getBrowserInstallationId(): string {
  const existing = window.localStorage.getItem(PUSH_INSTALLATION_ID_KEY);
  if (existing) return existing;

  const generated = window.crypto.randomUUID();
  window.localStorage.setItem(PUSH_INSTALLATION_ID_KEY, generated);
  return generated;
}

function endpointStorageKey(installationId: string): string {
  return `${PUSH_ENDPOINT_KEY_PREFIX}:${installationId}`;
}

function getPreviousEndpoint(installationId: string): string | null {
  return window.localStorage.getItem(endpointStorageKey(installationId));
}

function setPreviousEndpoint(installationId: string, endpoint: string): void {
  window.localStorage.setItem(endpointStorageKey(installationId), endpoint);
}

function clearPreviousEndpoint(installationId: string): void {
  window.localStorage.removeItem(endpointStorageKey(installationId));
}

async function persistSubscription(
  subscription: PushSubscription,
  installationId: string,
  previousEndpoint: string | null
): Promise<boolean> {
  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...subscription.toJSON(),
      installationId,
      previousEndpoint,
    }),
  });
  return response.ok;
}

export function PushNotificationSetup({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  const register = useCallback(async (): Promise<boolean> => {
    if (!vapidPublicKey) return false;

    const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, {
      scope: SERVICE_WORKER_SCOPE,
      updateViaCache: "none",
    });
    const existing = await registration.pushManager.getSubscription();
    const installationId = getBrowserInstallationId();

    // Re-post even an existing subscription: the row may have been pruned
    // server-side after an expiry, and upsert makes this cheap.
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      }));

    const previousEndpoint = getPreviousEndpoint(installationId);
    const ok = await persistSubscription(subscription, installationId, previousEndpoint);

    if (ok) {
      setPreviousEndpoint(installationId, subscription.endpoint);
    }

    return ok;
  }, [vapidPublicKey]);

  // On mount: if permission was already granted, silently make sure the
  // subscription exists and is stored (covers a pruned row or a new browser).
  useEffect(() => {
    if (!supported || !vapidPublicKey) {
      setState("unsupported");
      return;
    }

    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }

    if (Notification.permission === "granted") {
      register()
        .then((ok) => setState(ok ? "enabled" : "prompt"))
        .catch(() => setState("prompt"));
      return;
    }

    setState("prompt");
  }, [supported, vapidPublicKey, register]);

  async function handleEnable() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "prompt");
        return;
      }

      const ok = await register();
      if (ok) {
        setState("enabled");
      } else {
        setError("Couldn't enable push notifications. Please try again.");
      }
    } catch {
      setError("Couldn't enable push notifications. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    setError(null);
    try {
      const installationId = getBrowserInstallationId();
      const registration = await navigator.serviceWorker.getRegistration(
        SERVICE_WORKER_SCOPE
      );
      const subscription = await registration?.pushManager.getSubscription();
      const endpoint = subscription?.endpoint;

      // Unsubscribe in the browser first, then drop the server row. Doing it
      // in this order means a failure can't leave a live browser subscription
      // whose endpoint we no longer know.
      await subscription?.unsubscribe();

      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });

      clearPreviousEndpoint(installationId);
      setState("prompt");
    } catch {
      setError("Couldn't turn off push notifications. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading" || state === "unsupported") {
    return null;
  }

  if (state === "enabled") {
    return (
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="font-mono text-[11px] uppercase tracking-wide text-pitch-500">
          Push on
        </span>
        <button
          onClick={handleDisable}
          disabled={busy}
          className="text-[11px] text-chalk-200 underline transition-colors hover:text-chalk-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Turning off…" : "Turn off"}
        </button>
      </div>
    );
  }

  if (state === "denied") {
    return (
      <p className="rounded-card border border-pitch-700 bg-pitch-900 px-3 py-2 text-xs text-chalk-200">
        Browser notifications are blocked. Enable them in your browser settings to
        get SLA warnings while this tab is closed.
      </p>
    );
  }

  return (
    <div className="rounded-card border border-pitch-700 bg-pitch-900 px-3 py-2">
      <p className="text-xs text-chalk-200">
        Get SLA warnings even when this tab is closed.
      </p>
      <button
        onClick={handleEnable}
        disabled={busy}
        className="mt-2 rounded-[8px] border border-pitch-700 px-3 py-1 text-xs text-chalk-200 transition-colors hover:border-clock-amber hover:text-chalk-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Enabling…" : "Enable notifications"}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-clock-red">
          {error}
        </p>
      )}
    </div>
  );
}

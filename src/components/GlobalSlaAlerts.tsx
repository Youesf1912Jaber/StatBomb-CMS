"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAdminDashboardAssignments, getAssignmentsForCollector } from "@/lib/assignments/queries";
import {
  isSlaWarningActive,
  nextSlaAlertCheck,
  toSlaAlertItems,
  warningEventId,
  type SlaAlertAssignment,
} from "@/lib/assignments/sla-alarm";
import { createClient } from "@/lib/supabase/client";
import { SlaAlertCard } from "./SlaAlertCard";

const AUDIO_OWNER_KEY = "sla-alert-audio-owner";
const AUDIO_OWNER_TTL_MS = 15_000;
const REFRESH_INTERVAL_MS = 60_000;

interface GlobalSlaAlertsProps {
  assignments: SlaAlertAssignment[];
  role: "admin" | "collector";
  profileId: string;
  collectorName: string;
}

function silenceStorageKey(eventId: string): string {
  return `sla-alert-silenced:${eventId}`;
}

function getStoredSilences(assignments: SlaAlertAssignment[]): Set<string> {
  const silenced = new Set<string>();
  for (const assignment of assignments) {
    const eventId = warningEventId(assignment);
    try {
      if (window.localStorage.getItem(silenceStorageKey(eventId)) === "1") {
        silenced.add(eventId);
      }
    } catch {
      return silenced;
    }
  }
  return silenced;
}

function createTabId(): string {
  return `${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

export function GlobalSlaAlerts({
  assignments,
  role,
  profileId,
  collectorName,
}: GlobalSlaAlertsProps) {
  const [items, setItems] = useState(assignments);
  const [now, setNow] = useState(() => Date.now());
  const [silencedEvents, setSilencedEvents] = useState<Set<string>>(() =>
    typeof window === "undefined" ? new Set() : getStoredSilences(assignments)
  );
  const [soundUnlocked, setSoundUnlocked] = useState(false);
  const [soundNeedsUnlock, setSoundNeedsUnlock] = useState(false);
  const audiosRef = useRef(new Map<string, HTMLAudioElement>());
  const tabIdRef = useRef<string>("");

  if (!tabIdRef.current && typeof window !== "undefined") {
    tabIdRef.current = createTabId();
  }

  const refreshAssignments = useCallback(async () => {
    const supabase = createClient();
    const relevant =
      role === "admin"
        ? await getAdminDashboardAssignments(supabase)
        : await getAssignmentsForCollector(supabase, profileId);

    let collectorNames: Record<string, string> = {};
    if (role === "admin") {
      const collectorIds = [...new Set(relevant.map((assignment) => assignment.collector_id))];
      if (collectorIds.length > 0) {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", collectorIds);
        if (error) throw error;
        collectorNames = Object.fromEntries(
          (data ?? []).map((collector) => [
            collector.id,
            collector.full_name ?? collector.email,
          ])
        );
      }
    }

    const nextItems = toSlaAlertItems(
      relevant,
      (collectorId) => collectorNames[collectorId] ?? collectorName
    );
    setItems(nextItems);
    setSilencedEvents((current) => {
      const stored = getStoredSilences(nextItems);
      return new Set([...current, ...stored]);
    });
    setNow(Date.now());
  }, [collectorName, profileId, role]);

  useEffect(() => {
    setItems(assignments);
    setSilencedEvents(getStoredSilences(assignments));
    setNow(Date.now());
  }, [assignments]);

  useEffect(() => {
    const nextCheck = nextSlaAlertCheck(items, now);
    if (nextCheck === null) return;

    const timeout = window.setTimeout(
      () => setNow(Date.now()),
      Math.max(0, nextCheck - Date.now()) + 50
    );
    return () => window.clearTimeout(timeout);
  }, [items, now]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshAssignments().catch((error: unknown) => {
        console.error("[sla-alerts] assignment refresh failed", error);
      });
    }, REFRESH_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshAssignments().catch((error: unknown) => {
          console.error("[sla-alerts] assignment refresh failed", error);
        });
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshAssignments]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`sla-alerts:${role}:${profileId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "assignments" },
        () => {
          void refreshAssignments().catch((error: unknown) => {
            console.error("[sla-alerts] realtime refresh failed", error);
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profileId, refreshAssignments, role]);

  const activeAlerts = useMemo(
    () =>
      items.filter(
        (assignment) =>
          !silencedEvents.has(warningEventId(assignment)) && isSlaWarningActive(assignment, now)
      ),
    [items, now, silencedEvents]
  );

  const ownsAudio = useCallback((): boolean => {
    const tabId = tabIdRef.current;
    if (!tabId) return false;

    try {
      const raw = window.localStorage.getItem(AUDIO_OWNER_KEY);
      const current = raw ? (JSON.parse(raw) as { tabId?: string; expiresAt?: number }) : null;
      const canClaim =
        !current ||
        current.tabId === tabId ||
        typeof current.expiresAt !== "number" ||
        current.expiresAt <= Date.now();

      if (!canClaim) return false;
      window.localStorage.setItem(
        AUDIO_OWNER_KEY,
        JSON.stringify({ tabId, expiresAt: Date.now() + AUDIO_OWNER_TTL_MS })
      );
      return true;
    } catch {
      return true;
    }
  }, []);

  const stopAudio = useCallback((eventId: string) => {
    const audio = audiosRef.current.get(eventId);
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    audiosRef.current.delete(eventId);
  }, []);

  const stopAllAudio = useCallback(() => {
    for (const eventId of audiosRef.current.keys()) {
      stopAudio(eventId);
    }
  }, [stopAudio]);

  useEffect(() => {
    const renewLease = () => {
      if (activeAlerts.length > 0 && soundUnlocked) ownsAudio();
    };
    renewLease();
    const interval = window.setInterval(renewLease, AUDIO_OWNER_TTL_MS / 2);
    const onStorage = (event: StorageEvent) => {
      if (event.key === AUDIO_OWNER_KEY && !ownsAudio()) stopAllAudio();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("storage", onStorage);
    };
  }, [activeAlerts.length, ownsAudio, soundUnlocked, stopAllAudio]);

  useEffect(() => {
    const activeEventIds = new Set(activeAlerts.map(warningEventId));
    for (const eventId of audiosRef.current.keys()) {
      if (!activeEventIds.has(eventId) || !soundUnlocked || !ownsAudio()) {
        stopAudio(eventId);
      }
    }

    if (activeAlerts.length === 0 || !soundUnlocked || !ownsAudio()) return;

    for (const assignment of activeAlerts) {
      const eventId = warningEventId(assignment);
      if (audiosRef.current.has(eventId)) continue;

      const audio = new Audio("/sounds/sla-warning.wav");
      audio.loop = true;
      audiosRef.current.set(eventId, audio);
      void audio.play().catch(() => {
        stopAudio(eventId);
        setSoundNeedsUnlock(true);
      });
    }
  }, [activeAlerts, ownsAudio, soundUnlocked, stopAudio]);

  useEffect(() => stopAllAudio, [stopAllAudio]);

  const enableSound = useCallback(async () => {
    try {
      const unlock = new Audio("/sounds/sla-warning.wav");
      await unlock.play();
      unlock.pause();
      unlock.currentTime = 0;
      setSoundUnlocked(true);
      setSoundNeedsUnlock(false);
    } catch {
      setSoundNeedsUnlock(true);
    }
  }, []);

  const stopAlarm = useCallback(
    (assignment: SlaAlertAssignment) => {
      const eventId = warningEventId(assignment);
      stopAudio(eventId);
      try {
        window.localStorage.setItem(silenceStorageKey(eventId), "1");
      } catch {
        // The in-memory state still prevents this event from reappearing this session.
      }
      setSilencedEvents((current) => new Set(current).add(eventId));
    },
    [stopAudio]
  );

  const showSoundControl = activeAlerts.length > 0 && (!soundUnlocked || soundNeedsUnlock);

  if (activeAlerts.length === 0 && !soundNeedsUnlock) return null;

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-3 sm:left-auto sm:w-[28rem]">
      {showSoundControl && (
        <div className="pointer-events-auto w-full rounded-card border border-pitch-600 bg-pitch-900 p-3 shadow-xl">
          <p className="text-sm text-chalk-100">
            {soundNeedsUnlock
              ? "Alarm sound needs your permission to play in this tab."
              : "Enable alarm sound for this tab."}
          </p>
          <button
            type="button"
            onClick={() => void enableSound()}
            className="mt-2 rounded-[8px] border border-clock-amber px-3 py-1.5 text-sm font-semibold text-clock-amber transition-colors hover:bg-clock-amber hover:text-ink"
          >
            Enable Alarm Sound
          </button>
        </div>
      )}
      {activeAlerts.map((assignment) => (
        <div key={warningEventId(assignment)} className="pointer-events-auto w-full">
          <SlaAlertCard assignment={assignment} onStop={stopAlarm} />
        </div>
      ))}
    </div>
  );
}

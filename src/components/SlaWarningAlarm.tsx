"use client";

import { useEffect, useRef } from "react";

type AssignmentStatus = "Not Started" | "In Progress" | "Completed" | "Overdue";

const STOP_ALARM_MESSAGE_TYPE = "sla-stop-alarm";
const STOP_ALARM_CHANNEL = "sla-warning-alarm";

interface SlaWarningAlarmProps {
  assignmentId: string;
  sla: string;
  status: AssignmentStatus;
  homeTeam: string;
  awayTeam: string;
  competition: string | null;
  collectorName: string;
  half: string;
  task: string;
}

function firedStorageKey(assignmentId: string, sla: string): string {
  return `sla-warning-fired:${assignmentId}:${sla}`;
}

function isStopAlarmMessage(data: unknown, assignmentId: string): boolean {
  if (!data || typeof data !== "object") return false;
  const message = data as { type?: unknown; assignmentId?: unknown };
  if (message.type !== STOP_ALARM_MESSAGE_TYPE) return false;
  return message.assignmentId === assignmentId;
}

function buildWarningBody(props: {
  homeTeam: string;
  awayTeam: string;
  competition: string | null;
  collectorName: string;
  half: string;
  task: string;
}): string {
  const lines = [`${props.homeTeam} vs ${props.awayTeam}`];
  if (props.competition) {
    lines.push(props.competition);
  }
  lines.push(`${props.half} — ${props.collectorName}`);
  lines.push(`Task: ${props.task}`);
  lines.push("SLA warning: 1 hour remaining.");
  return lines.join("\n");
}

async function showSlaWarningNotification(props: {
  assignmentId: string;
  sla: string;
  homeTeam: string;
  awayTeam: string;
  competition: string | null;
  collectorName: string;
  half: string;
  task: string;
}): Promise<void> {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (!("serviceWorker" in navigator)) return;

  const registration =
    (await navigator.serviceWorker.getRegistration("/sw.js")) ??
    (await navigator.serviceWorker.ready);

  await registration.showNotification("SLA Warning", {
    body: buildWarningBody(props),
    tag: `sla-warning-alarm:${props.assignmentId}:${props.sla}`,
    renotify: true,
    requireInteraction: true,
    data: {
      type: "sla_warning_alarm",
      assignmentId: props.assignmentId,
    },
    actions: [{ action: "stop-alarm", title: "Stop Alarm" }],
  } as NotificationOptions);
}

export function SlaWarningAlarm({
  assignmentId,
  sla,
  status,
  homeTeam,
  awayTeam,
  competition,
  collectorName,
  half,
  task,
}: SlaWarningAlarmProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio("/sounds/sla-warning.wav");
    audio.loop = true;
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.currentTime = 0;
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const stopAndReset = () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      audio.currentTime = 0;
    };

    const onMessage = (event: MessageEvent) => {
      if (!isStopAlarmMessage(event.data, assignmentId)) return;
      stopAndReset();
    };

    navigator.serviceWorker?.addEventListener("message", onMessage);

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(STOP_ALARM_CHANNEL);
      channel.addEventListener("message", onMessage);
    } catch {
      channel = null;
    }

    return () => {
      navigator.serviceWorker?.removeEventListener("message", onMessage);
      if (channel) {
        channel.removeEventListener("message", onMessage);
        channel.close();
      }
    };
  }, [assignmentId]);

  useEffect(() => {
    const slaMs = new Date(sla).getTime();
    if (!Number.isFinite(slaMs)) {
      return;
    }

    const warningAt = slaMs - 60 * 60 * 1000;
    const key = firedStorageKey(assignmentId, sla);

    const stopAndReset = () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      audio.currentTime = 0;
    };

    if (status === "Completed") {
      stopAndReset();
      return;
    }

    let fired = false;
    try {
      fired = window.localStorage.getItem(key) !== null;
    } catch {
      fired = false;
    }

    const markFired = () => {
      fired = true;
      try {
        window.localStorage.setItem(key, "1");
      } catch {
        return;
      }
    };

    const attemptPlay = () => {
      if (fired) return;
      if (Date.now() < warningAt) return;

      const audio = audioRef.current;
      if (!audio) return;

      const playResult = audio.play();
      if (playResult !== undefined) {
        playResult
          .then(() => {
            const alreadyFired = fired;
            markFired();
            if (alreadyFired) return;
            void showSlaWarningNotification({
              assignmentId,
              sla,
              homeTeam,
              awayTeam,
              competition,
              collectorName,
              half,
              task,
            }).catch(() => {
              return;
            });
          })
          .catch(() => {
            return;
          });
      }
    };

    const check = () => {
      if (document.visibilityState !== "visible") return;
      attemptPlay();
    };

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startInterval = () => {
      if (intervalId !== null) return;
      intervalId = setInterval(check, 1000);
    };

    const stopInterval = () => {
      if (intervalId === null) return;
      clearInterval(intervalId);
      intervalId = null;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        check();
        startInterval();
      } else {
        stopInterval();
      }
    };

    if (document.visibilityState === "visible") {
      check();
      startInterval();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stopInterval();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [
    assignmentId,
    sla,
    status,
    homeTeam,
    awayTeam,
    competition,
    collectorName,
    half,
    task,
  ]);

  return null;
}

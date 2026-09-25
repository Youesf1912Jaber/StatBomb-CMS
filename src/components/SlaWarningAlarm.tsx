"use client";

import { useEffect, useRef } from "react";

type AssignmentStatus = "Not Started" | "In Progress" | "Completed" | "Overdue";

interface SlaWarningAlarmProps {
  assignmentId: string;
  sla: string;
  status: AssignmentStatus;
}

function firedStorageKey(assignmentId: string, sla: string): string {
  return `sla-warning-fired:${assignmentId}:${sla}`;
}

export function SlaWarningAlarm({ assignmentId, sla, status }: SlaWarningAlarmProps) {
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
        playResult.then(markFired).catch(() => {
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
  }, [assignmentId, sla, status]);

  return null;
}

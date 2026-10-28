"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Keep Shift Analysis current while the page is open. Realtime refreshes
 * immediately when assignments or task timers change; the polling fallback
 * catches updates if a Realtime event is missed or the subscription is offline.
 */
export function ShiftAnalysisLiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("shift-analysis-live-refresh")
      .on("postgres_changes", { event: "*", schema: "public", table: "assignments" }, () => {
        router.refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "assignment_task_timers" }, () => {
        router.refresh();
      })
      .subscribe();

    const interval = window.setInterval(() => router.refresh(), 30000);

    return () => {
      void supabase.removeChannel(channel);
      window.clearInterval(interval);
    };
  }, [router]);

  return null;
}

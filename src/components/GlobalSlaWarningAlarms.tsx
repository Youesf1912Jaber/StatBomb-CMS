"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AssignmentStatus } from "@/types/database.types";
import { SlaWarningAlarm, type SlaWarningAlarmProps } from "./SlaWarningAlarm";

interface GlobalSlaWarningAlarmsProps {
  assignments: SlaWarningAlarmProps[];
}

export function GlobalSlaWarningAlarms({ assignments }: GlobalSlaWarningAlarmsProps) {
  const [items, setItems] = useState(assignments);

  useEffect(() => {
    setItems(assignments);
  }, [assignments]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("global-sla-warning-alarms")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "assignments" },
        (payload) => {
          const row = payload.new as {
            id?: unknown;
            status?: unknown;
            sla?: unknown;
          };
          if (typeof row.id !== "string") return;
          const nextStatus = row.status as AssignmentStatus | undefined;
          const nextSla = typeof row.sla === "string" ? row.sla : undefined;

          setItems((prev) =>
            prev.map((item) => {
              if (item.assignmentId !== row.id) return item;
              return {
                ...item,
                status: nextStatus ?? item.status,
                sla: nextSla ?? item.sla,
              };
            })
          );
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <>
      {items
        .filter((item) => item.status !== "Completed")
        .map((item) => (
          <SlaWarningAlarm key={item.assignmentId} {...item} />
        ))}
    </>
  );
}

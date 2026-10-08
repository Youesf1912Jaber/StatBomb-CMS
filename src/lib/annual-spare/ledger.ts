import type { AnnualLeaveAction, AnnualLeaveLedgerRow, AnnualLeaveType } from "../../types/database.types";
import type { ExpectedWeekBlock, ExpectedWeekday } from "../expected/types";
import { annualLeaveSheetSyncPendingFields } from "./sheet-sync-status";

export const ANNUAL_LEAVE_TYPES: AnnualLeaveType[] = ["AL-R", "AL-C"];

const WEEKDAYS: ExpectedWeekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const WEEKDAY_LABEL: Record<ExpectedWeekday, string> = {
  sunday: "Sunday",
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
};

export type DesiredLeave = {
  hr_code: string;
  leave_date: string;
  leave_type: AnnualLeaveType;
  source_week: string;
  source_cell: string;
};

export type LedgerPlanInsert = DesiredLeave & {
  collector_id: string | null;
  action: "consume";
  sheet_sync_status: "pending";
  sheet_sync_error: null;
  sheet_applied_at: null;
};

export type LedgerPlanConsumeUpdate = {
  id: string;
  collector_id: string | null;
  source_week: string;
  source_cell: string;
  sheet_sync_status: "pending";
};

export type LedgerPlanReverseUpdate = {
  id: string;
  sheet_sync_status: "pending";
};

export type AnnualLeaveLedgerPlan = {
  inserts: LedgerPlanInsert[];
  consumeUpdates: LedgerPlanConsumeUpdate[];
  reverseUpdates: LedgerPlanReverseUpdate[];
};

export function normalizeLeaveHrCode(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u200b-\u200f\u202a-\u202e]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function parseAnnualLeaveType(value: unknown): AnnualLeaveType | null {
  const text = String(value ?? "")
    .replace(/[\u200b-\u200f\u202a-\u202e]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text === "AL-R" || text === "AL-C") return text;
  return null;
}

export function addDaysToIsoDate(iso: string, days: number): string | null {
  const parts = iso.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day + days));
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function leaveIdentityKey(hrCode: string, leaveDate: string, leaveType: AnnualLeaveType): string {
  return `${hrCode}|${leaveDate}|${leaveType}`;
}

export function extractDesiredLeaves(weeks: ExpectedWeekBlock[]): DesiredLeave[] {
  const byIdentity = new Map<string, DesiredLeave>();

  for (const week of weeks) {
    const weekStart = week.week_start_date?.trim() ?? "";
    if (!weekStart) continue;

    for (const collector of week.collectors) {
      const hrCode = normalizeLeaveHrCode(collector.hr_code.value);
      if (!hrCode) continue;

      for (let offset = 0; offset < WEEKDAYS.length; offset += 1) {
        const weekday = WEEKDAYS[offset];
        if (!weekday) continue;
        const leaveType = parseAnnualLeaveType(collector.days[weekday]?.value);
        if (!leaveType) continue;
        const leaveDate = addDaysToIsoDate(weekStart, offset);
        if (!leaveDate) continue;
        const desired: DesiredLeave = {
          hr_code: hrCode,
          leave_date: leaveDate,
          leave_type: leaveType,
          source_week: weekStart,
          source_cell: WEEKDAY_LABEL[weekday],
        };
        byIdentity.set(leaveIdentityKey(hrCode, leaveDate, leaveType), desired);
      }
    }
  }

  return [...byIdentity.values()];
}

export function planAnnualLeaveLedger(input: {
  desired: DesiredLeave[];
  existing: Pick<AnnualLeaveLedgerRow, "id" | "hr_code" | "leave_date" | "leave_type" | "action">[];
  profilesByHrCode: Map<string, string>;
}): AnnualLeaveLedgerPlan {
  const desiredByIdentity = new Map(
    input.desired.map((row) => [leaveIdentityKey(row.hr_code, row.leave_date, row.leave_type), row])
  );
  const existingByIdentity = new Map(
    input.existing.map((row) => [leaveIdentityKey(row.hr_code, row.leave_date, row.leave_type), row])
  );

  const inserts: LedgerPlanInsert[] = [];
  const consumeUpdates: LedgerPlanConsumeUpdate[] = [];
  const reverseUpdates: LedgerPlanReverseUpdate[] = [];

  for (const desired of desiredByIdentity.values()) {
    const existing = existingByIdentity.get(
      leaveIdentityKey(desired.hr_code, desired.leave_date, desired.leave_type)
    );
    const collectorId = input.profilesByHrCode.get(desired.hr_code) ?? null;
    if (!existing) {
      inserts.push({
        ...desired,
        collector_id: collectorId,
        action: "consume",
        ...annualLeaveSheetSyncPendingFields(),
      });
      continue;
    }
    if (existing.action === "reverse") {
      consumeUpdates.push({
        id: existing.id,
        collector_id: collectorId,
        source_week: desired.source_week,
        source_cell: desired.source_cell,
        sheet_sync_status: "pending",
      });
    }
  }

  for (const existing of existingByIdentity.values()) {
    const desired = desiredByIdentity.get(
      leaveIdentityKey(existing.hr_code, existing.leave_date, existing.leave_type)
    );
    if (!desired && existing.action === "consume") {
      reverseUpdates.push({ id: existing.id, sheet_sync_status: "pending" });
    }
  }

  return { inserts, consumeUpdates, reverseUpdates };
}

export function isAnnualLeaveAction(value: string): value is AnnualLeaveAction {
  return value === "consume" || value === "reverse";
}

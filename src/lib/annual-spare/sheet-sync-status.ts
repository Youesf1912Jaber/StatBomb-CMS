import type { AnnualLeaveSheetSyncStatus } from "../../types/database.types";

export const ANNUAL_LEAVE_SHEET_SYNC_STATUSES: AnnualLeaveSheetSyncStatus[] = [
  "pending",
  "written",
  "failed",
];

export function annualLeaveSheetSyncPendingFields() {
  return {
    sheet_sync_status: "pending" as const,
    sheet_sync_error: null,
    sheet_applied_at: null,
  };
}

export function annualLeaveSheetSyncWrittenFields(appliedAt: string) {
  return {
    sheet_sync_status: "written" as const,
    sheet_applied_at: appliedAt,
    sheet_sync_error: null,
  };
}

export function annualLeaveSheetSyncFailedFields(error: string) {
  return {
    sheet_sync_status: "failed" as const,
    sheet_sync_error: error,
  };
}

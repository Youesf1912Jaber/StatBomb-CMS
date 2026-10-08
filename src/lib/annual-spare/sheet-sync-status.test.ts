import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { AnnualLeaveLedgerRow } from "../../types/database.types";
import type { ExpectedCollectorRow, ExpectedSheetCell, ExpectedWeekBlock, ExpectedWeekday } from "../expected/types";
import { extractDesiredLeaves, planAnnualLeaveLedger } from "./ledger";
import {
  annualLeaveSheetSyncFailedFields,
  annualLeaveSheetSyncPendingFields,
  annualLeaveSheetSyncWrittenFields,
} from "./sheet-sync-status";

function cell(value: string): ExpectedSheetCell {
  return { row: 1, column: 0, column_letter: "A", value };
}

function collector(hrCode: string, days: Partial<Record<ExpectedWeekday, string>>): ExpectedCollectorRow {
  const empty = cell("");
  return {
    row_number: 4,
    hr_code: cell(hrCode),
    collector: cell("Ada"),
    type: cell("Full"),
    days: {
      sunday: cell(days.sunday ?? "1"),
      monday: cell(days.monday ?? "1"),
      tuesday: cell(days.tuesday ?? "1"),
      wednesday: cell(days.wednesday ?? "1"),
      thursday: cell(days.thursday ?? "1"),
      friday: cell(days.friday ?? "WV"),
      saturday: cell(days.saturday ?? "WV"),
    },
    count_m1: empty,
    sum_m1: empty,
    actual_m1: empty,
  };
}

function week(start: string, collectors: ExpectedCollectorRow[]): ExpectedWeekBlock {
  const empty = cell("");
  return {
    header_row: 1,
    start_row: 1,
    end_row: 10,
    week_start_date: start,
    week_end_date: null,
    week_start_cell: null,
    week_end_cell: null,
    shift_name: null,
    shift_name_cell: null,
    shift_time: null,
    shift_time_cell: null,
    daily_shifts: {
      sunday: null,
      monday: null,
      tuesday: null,
      wednesday: null,
      thursday: null,
      friday: null,
      saturday: null,
    },
    columns: {
      hr_code: 0,
      collector: 1,
      type: 2,
      days: {
        sunday: 3,
        monday: 4,
        tuesday: 5,
        wednesday: 6,
        thursday: 7,
        friday: 8,
        saturday: 9,
      },
      count_m1: 10,
      sum_m1: 11,
      actual_m1: 12,
      summary_start: 13,
    },
    collectors,
    summary: {
      al_r: empty,
      ul: empty,
      al_c: empty,
      h: empty,
      sl: empty,
      total_absence: empty,
      total_shifts_all_team: empty,
      expected_shift_matches: empty,
      over_target: empty,
      total_shift_expected_before: empty,
      expected_matches_before_week: empty,
      completed_end_of_week: empty,
      actual_shifts_end_of_week: empty,
      diff: empty,
      extras: [],
    },
  };
}

function existingRow(
  overrides: Pick<AnnualLeaveLedgerRow, "id" | "hr_code" | "leave_date" | "leave_type" | "action"> &
    Partial<Pick<AnnualLeaveLedgerRow, "sheet_sync_status" | "sheet_sync_error" | "sheet_applied_at">>
): Pick<AnnualLeaveLedgerRow, "id" | "hr_code" | "leave_date" | "leave_type" | "action"> &
  Partial<Pick<AnnualLeaveLedgerRow, "sheet_sync_status" | "sheet_sync_error" | "sheet_applied_at">> {
  return overrides;
}

const profiles = new Map([["C001", "profile-1"]]);
const dir = fileURLToPath(new URL(".", import.meta.url));

describe("annual leave sheet sync status", () => {
  it("marks a new consume row pending", () => {
    const desired = extractDesiredLeaves([
      week("2026-08-16", [collector("C001", { sunday: "AL-R" })]),
    ]);
    const plan = planAnnualLeaveLedger({ desired, existing: [], profilesByHrCode: profiles });
    assert.equal(plan.inserts.length, 1);
    assert.equal(plan.inserts[0]?.action, "consume");
    assert.equal(plan.inserts[0]?.sheet_sync_status, "pending");
    assert.equal(plan.inserts[0]?.sheet_sync_error, null);
    assert.equal(plan.inserts[0]?.sheet_applied_at, null);
  });

  it("marks a new AL-R consume pending", () => {
    const desired = extractDesiredLeaves([
      week("2026-08-16", [collector("C001", { sunday: "AL-R" })]),
    ]);
    const plan = planAnnualLeaveLedger({ desired, existing: [], profilesByHrCode: profiles });
    assert.equal(plan.inserts[0]?.leave_type, "AL-R");
    assert.equal(plan.inserts[0]?.sheet_sync_status, "pending");
  });

  it("marks a new AL-C consume pending", () => {
    const desired = extractDesiredLeaves([
      week("2026-08-16", [collector("C001", { monday: "AL-C" })]),
    ]);
    const plan = planAnnualLeaveLedger({ desired, existing: [], profilesByHrCode: profiles });
    assert.equal(plan.inserts[0]?.leave_type, "AL-C");
    assert.equal(plan.inserts[0]?.sheet_sync_status, "pending");
  });

  it("marks consume to reverse as pending", () => {
    const desired = extractDesiredLeaves([
      week("2026-08-16", [collector("C001", { sunday: "1" })]),
    ]);
    const plan = planAnnualLeaveLedger({
      desired,
      existing: [
        existingRow({
          id: "row-1",
          hr_code: "C001",
          leave_date: "2026-08-16",
          leave_type: "AL-R",
          action: "consume",
          sheet_sync_status: "written",
        }),
      ],
      profilesByHrCode: profiles,
    });
    assert.equal(plan.inserts.length, 0);
    assert.deepEqual(plan.reverseUpdates, [{ id: "row-1", sheet_sync_status: "pending" }]);
  });

  it("marks reverse to consume as pending", () => {
    const desired = extractDesiredLeaves([
      week("2026-08-16", [collector("C001", { sunday: "AL-R" })]),
    ]);
    const plan = planAnnualLeaveLedger({
      desired,
      existing: [
        existingRow({
          id: "row-1",
          hr_code: "C001",
          leave_date: "2026-08-16",
          leave_type: "AL-R",
          action: "reverse",
          sheet_sync_status: "written",
        }),
      ],
      profilesByHrCode: profiles,
    });
    assert.equal(plan.inserts.length, 0);
    assert.equal(plan.reverseUpdates.length, 0);
    assert.equal(plan.consumeUpdates[0]?.id, "row-1");
    assert.equal(plan.consumeUpdates[0]?.sheet_sync_status, "pending");
  });

  it("does not change sync status for an unchanged consume", () => {
    const desired = extractDesiredLeaves([
      week("2026-08-16", [collector("C001", { sunday: "AL-R" })]),
    ]);
    const existing = [
      existingRow({
        id: "row-1",
        hr_code: "C001",
        leave_date: "2026-08-16",
        leave_type: "AL-R",
        action: "consume",
        sheet_sync_status: "written",
        sheet_applied_at: "2026-08-16T10:00:00.000Z",
      }),
    ];
    const plan = planAnnualLeaveLedger({ desired, existing, profilesByHrCode: profiles });
    assert.equal(plan.inserts.length, 0);
    assert.equal(plan.consumeUpdates.length, 0);
    assert.equal(plan.reverseUpdates.length, 0);
    assert.equal(existing[0]?.sheet_sync_status, "written");
  });

  it("stores sheet_applied_at when marked written", () => {
    const appliedAt = "2026-10-08T12:00:00.000Z";
    assert.deepEqual(annualLeaveSheetSyncWrittenFields(appliedAt), {
      sheet_sync_status: "written",
      sheet_applied_at: appliedAt,
      sheet_sync_error: null,
    });
  });

  it("stores the error when marked failed", () => {
    assert.deepEqual(annualLeaveSheetSyncFailedFields("row not found"), {
      sheet_sync_status: "failed",
      sheet_sync_error: "row not found",
    });
    const failed = annualLeaveSheetSyncFailedFields("row not found");
    assert.equal("action" in failed, false);
    assert.equal("sheet_applied_at" in failed, false);
  });

  it("does not automatically mark historical existing rows pending", () => {
    const desired = extractDesiredLeaves([
      week("2026-08-16", [collector("C001", { sunday: "AL-R" })]),
    ]);
    const existing = [
      existingRow({
        id: "historical-1",
        hr_code: "C001",
        leave_date: "2026-08-16",
        leave_type: "AL-R",
        action: "consume",
        sheet_sync_status: null,
      }),
    ];
    const plan = planAnnualLeaveLedger({ desired, existing, profilesByHrCode: profiles });
    assert.equal(plan.inserts.length, 0);
    assert.equal(plan.consumeUpdates.length, 0);
    assert.equal(plan.reverseUpdates.length, 0);
    assert.equal(existing[0]?.sheet_sync_status, null);
    assert.deepEqual(annualLeaveSheetSyncPendingFields(), {
      sheet_sync_status: "pending",
      sheet_sync_error: null,
      sheet_applied_at: null,
    });
  });

  it("keeps repeated reconciliation idempotent", () => {
    const desired = extractDesiredLeaves([
      week("2026-08-16", [collector("C001", { sunday: "AL-R", monday: "AL-C" })]),
    ]);
    const existing = [
      existingRow({
        id: "row-al-r",
        hr_code: "C001",
        leave_date: "2026-08-16",
        leave_type: "AL-R",
        action: "consume",
        sheet_sync_status: "pending",
      }),
      existingRow({
        id: "row-al-c",
        hr_code: "C001",
        leave_date: "2026-08-17",
        leave_type: "AL-C",
        action: "consume",
        sheet_sync_status: "written",
      }),
    ];
    const first = planAnnualLeaveLedger({ desired, existing, profilesByHrCode: profiles });
    const second = planAnnualLeaveLedger({ desired, existing, profilesByHrCode: profiles });
    assert.equal(first.inserts.length, 0);
    assert.equal(first.consumeUpdates.length, 0);
    assert.equal(first.reverseUpdates.length, 0);
    assert.deepEqual(second, first);
  });
});

describe("annual leave sheet sync helpers stay write-free", () => {
  it("does not call Google Sheets and only updates pending rows", () => {
    const helpers = readFileSync(join(dir, "sheet-sync.ts"), "utf8");
    const status = readFileSync(join(dir, "sheet-sync-status.ts"), "utf8");
    const sync = readFileSync(join(dir, "ledger-sync.ts"), "utf8");
    const sheet = readFileSync(join(dir, "sheet.ts"), "utf8");
    const balance = readFileSync(join(dir, "balance.ts"), "utf8");
    const queries = readFileSync(join(dir, "queries.ts"), "utf8");

    assert.match(helpers, /getPendingAnnualLeaveSheetSyncRows/);
    assert.match(helpers, /markAnnualLeaveSheetSyncWritten/);
    assert.match(helpers, /markAnnualLeaveSheetSyncFailed/);
    assert.match(helpers, /\.eq\("sheet_sync_status", "pending"\)/);
    assert.match(sync, /annualLeaveSheetSyncPendingFields/);
    assert.equal(helpers.includes("googleRequest"), false);
    assert.equal(helpers.includes("batchUpdate"), false);
    assert.equal(helpers.includes("values:batchUpdate"), false);
    assert.equal(status.includes("googleRequest"), false);
    assert.equal(sync.includes("googleRequest"), false);
    assert.equal(sync.includes("batchUpdate"), false);
    assert.equal(sheet.includes("values:batchUpdate"), false);
    assert.equal(balance.includes("sheet_sync_status"), false);
    assert.equal(queries.includes("sheet_sync_status"), false);
  });

  it("applies pending only when leave action changes", () => {
    const sync = readFileSync(join(dir, "ledger-sync.ts"), "utf8");
    assert.match(sync, /action: "consume"/);
    assert.match(sync, /action: "reverse"/);
    assert.match(sync, /\.\.\.annualLeaveSheetSyncPendingFields\(\)/);
    assert.equal(sync.includes("sheet_sync_status: \"written\""), false);
  });
});

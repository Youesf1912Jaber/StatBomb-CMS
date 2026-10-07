import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AnnualLeaveLedgerRow } from "../../types/database.types";
import type { ExpectedCollectorRow, ExpectedSheetCell, ExpectedWeekBlock, ExpectedWeekday } from "../expected/types";
import {
  extractDesiredLeaves,
  normalizeLeaveHrCode,
  parseAnnualLeaveType,
  planAnnualLeaveLedger,
} from "./ledger";

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
  overrides: Pick<AnnualLeaveLedgerRow, "id" | "hr_code" | "leave_date" | "leave_type" | "action">
): Pick<AnnualLeaveLedgerRow, "id" | "hr_code" | "leave_date" | "leave_type" | "action"> {
  return overrides;
}

describe("normalizeLeaveHrCode", () => {
  it("trims and uppercases HR-Code", () => {
    assert.equal(normalizeLeaveHrCode("  c001  "), "C001");
    assert.equal(normalizeLeaveHrCode("ab-12"), "AB-12");
  });
});

describe("parseAnnualLeaveType", () => {
  it("accepts only exact AL-R and AL-C", () => {
    assert.equal(parseAnnualLeaveType("AL-R"), "AL-R");
    assert.equal(parseAnnualLeaveType("AL-C"), "AL-C");
    assert.equal(parseAnnualLeaveType(" AL-R "), "AL-R");
    assert.equal(parseAnnualLeaveType("SL"), null);
    assert.equal(parseAnnualLeaveType("UL"), null);
    assert.equal(parseAnnualLeaveType("1"), null);
    assert.equal(parseAnnualLeaveType("0.75"), null);
    assert.equal(parseAnnualLeaveType("WV"), null);
    assert.equal(parseAnnualLeaveType("al-r"), null);
  });
});

describe("extractDesiredLeaves", () => {
  it("extracts AL-R and AL-C using calendar date, not sheet row", () => {
    const leaves = extractDesiredLeaves([
      week("2026-08-16", [
        collector("c001", { sunday: "AL-R", wednesday: "AL-C", friday: "SL" }),
      ]),
    ]);
    assert.deepEqual(
      leaves.map((row) => [row.hr_code, row.leave_date, row.leave_type, row.source_week, row.source_cell]),
      [
        ["C001", "2026-08-16", "AL-R", "2026-08-16", "Sunday"],
        ["C001", "2026-08-19", "AL-C", "2026-08-16", "Wednesday"],
      ]
    );
  });

  it("ignores non-leave daily values", () => {
    const leaves = extractDesiredLeaves([
      week("2026-08-16", [
        collector("C001", {
          sunday: "1",
          monday: "0.75",
          tuesday: "UL",
          wednesday: "SL",
          thursday: "H",
          friday: "WV",
          saturday: "0",
        }),
      ]),
    ]);
    assert.equal(leaves.length, 0);
  });

  it("dedupes the same hr_code + date + leave_type identity", () => {
    const leaves = extractDesiredLeaves([
      week("2026-08-16", [collector("C001", { sunday: "AL-R" })]),
      week("2026-08-16", [collector("c001", { sunday: "AL-R" })]),
    ]);
    assert.equal(leaves.length, 1);
    assert.equal(leaves[0]?.leave_type, "AL-R");
  });

  it("skips weeks without a start date and collectors without HR-Code", () => {
    const dated = week("2026-08-16", [collector("", { sunday: "AL-R" })]);
    const undated = week("", [collector("C001", { sunday: "AL-R" })]);
    undated.week_start_date = null;
    const leaves = extractDesiredLeaves([dated, undated]);
    assert.equal(leaves.length, 0);
  });
});

describe("planAnnualLeaveLedger", () => {
  const profiles = new Map([["C001", "profile-1"]]);

  it("inserts consume rows for new AL-R and AL-C", () => {
    const desired = extractDesiredLeaves([
      week("2026-08-16", [collector("C001", { sunday: "AL-R", monday: "AL-C" })]),
    ]);
    const plan = planAnnualLeaveLedger({ desired, existing: [], profilesByHrCode: profiles });
    assert.equal(plan.inserts.length, 2);
    assert.equal(plan.consumeUpdates.length, 0);
    assert.equal(plan.reverseUpdates.length, 0);
    assert.deepEqual(
      plan.inserts.map((row) => [row.hr_code, row.leave_date, row.leave_type, row.action, row.collector_id]),
      [
        ["C001", "2026-08-16", "AL-R", "consume", "profile-1"],
        ["C001", "2026-08-17", "AL-C", "consume", "profile-1"],
      ]
    );
  });

  it("is a no-op when the same leave is still present", () => {
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
          action: "consume",
        }),
      ],
      profilesByHrCode: profiles,
    });
    assert.equal(plan.inserts.length, 0);
    assert.equal(plan.consumeUpdates.length, 0);
    assert.equal(plan.reverseUpdates.length, 0);
  });

  it("does not insert a second row for the same identity", () => {
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
          action: "consume",
        }),
      ],
      profilesByHrCode: profiles,
    });
    assert.equal(plan.inserts.length, 0);
  });

  it("updates reverse to consume when leave returns", () => {
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
        }),
      ],
      profilesByHrCode: profiles,
    });
    assert.equal(plan.inserts.length, 0);
    assert.deepEqual(plan.consumeUpdates, [
      {
        id: "row-1",
        collector_id: "profile-1",
        source_week: "2026-08-16",
        source_cell: "Sunday",
      },
    ]);
    assert.equal(plan.reverseUpdates.length, 0);
  });

  it("reverses consume when leave is removed", () => {
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
        }),
      ],
      profilesByHrCode: profiles,
    });
    assert.equal(plan.inserts.length, 0);
    assert.equal(plan.consumeUpdates.length, 0);
    assert.deepEqual(plan.reverseUpdates, [{ id: "row-1" }]);
  });

  it("does not reverse an already reversed leave that is still absent", () => {
    const plan = planAnnualLeaveLedger({
      desired: [],
      existing: [
        existingRow({
          id: "row-1",
          hr_code: "C001",
          leave_date: "2026-08-16",
          leave_type: "AL-R",
          action: "reverse",
        }),
      ],
      profilesByHrCode: profiles,
    });
    assert.equal(plan.inserts.length, 0);
    assert.equal(plan.consumeUpdates.length, 0);
    assert.equal(plan.reverseUpdates.length, 0);
  });

  it("treats AL-R to AL-C as reverse old plus consume new", () => {
    const desired = extractDesiredLeaves([
      week("2026-08-16", [collector("C001", { sunday: "AL-C" })]),
    ]);
    const plan = planAnnualLeaveLedger({
      desired,
      existing: [
        existingRow({
          id: "row-al-r",
          hr_code: "C001",
          leave_date: "2026-08-16",
          leave_type: "AL-R",
          action: "consume",
        }),
      ],
      profilesByHrCode: profiles,
    });
    assert.equal(plan.inserts.length, 1);
    assert.equal(plan.inserts[0]?.leave_type, "AL-C");
    assert.equal(plan.inserts[0]?.action, "consume");
    assert.equal(plan.inserts[0]?.leave_date, "2026-08-16");
    assert.deepEqual(plan.reverseUpdates, [{ id: "row-al-r" }]);
    assert.equal(plan.consumeUpdates.length, 0);
  });

  it("leaves collector_id null when the HR-Code has no profile", () => {
    const desired = extractDesiredLeaves([
      week("2026-08-16", [collector("X-999", { sunday: "AL-R" })]),
    ]);
    const plan = planAnnualLeaveLedger({
      desired,
      existing: [],
      profilesByHrCode: profiles,
    });
    assert.equal(plan.inserts.length, 1);
    assert.equal(plan.inserts[0]?.hr_code, "X-999");
    assert.equal(plan.inserts[0]?.collector_id, null);
  });

  it("preserves source_week and source_cell on inserts", () => {
    const desired = extractDesiredLeaves([
      week("2026-08-16", [collector("C001", { thursday: "AL-R" })]),
    ]);
    const plan = planAnnualLeaveLedger({ desired, existing: [], profilesByHrCode: profiles });
    assert.equal(plan.inserts[0]?.source_week, "2026-08-16");
    assert.equal(plan.inserts[0]?.source_cell, "Thursday");
    assert.equal(plan.inserts[0]?.leave_date, "2026-08-20");
  });

  it("maps weekday offsets to calendar dates", () => {
    const desired = extractDesiredLeaves([
      week("2026-08-16", [collector("C001", { saturday: "AL-C" })]),
    ]);
    assert.equal(desired[0]?.leave_date, "2026-08-22");
    assert.equal(desired[0]?.source_cell, "Saturday");
  });
});

describe("expected leave ledger wiring", () => {
  const dir = fileURLToPath(new URL(".", import.meta.url));

  it("syncExpectedWeeks reconciles the ledger after week upsert", () => {
    const source = readFileSync(join(dir, "../expected/sync.ts"), "utf8");
    assert.match(source, /reconcileAnnualLeaveLedger/);
    assert.match(source, /await reconcileAnnualLeaveLedger\(client, sheet\.weeks\)/);
  });

  it("admin PATCH reconciles only after a successful Google Sheet write", () => {
    const source = readFileSync(join(dir, "../../app/api/admin/expected/weeks/[weekId]/route.ts"), "utf8");
    assert.match(source, /updateExpectedDailyValue/);
    assert.match(source, /createServiceRoleClient/);
    assert.match(source, /await reconcileAnnualLeaveLedger\(createServiceRoleClient\(\), data\.weeks\)/);
    const writeIndex = source.indexOf("await updateExpectedDailyValue");
    const reconcileIndex = source.indexOf("await reconcileAnnualLeaveLedger");
    assert.ok(writeIndex >= 0 && reconcileIndex > writeIndex);
  });

  it("does not write Annual Spare or change expected sheet writes", () => {
    const ledger = readFileSync(join(dir, "ledger.ts"), "utf8");
    const sync = readFileSync(join(dir, "ledger-sync.ts"), "utf8");
    const sheet = readFileSync(join(dir, "sheet.ts"), "utf8");
    assert.equal(ledger.includes("batchUpdate"), false);
    assert.equal(sync.includes("Annual Spare"), false);
    assert.equal(sync.includes("batchUpdate"), false);
    assert.match(sheet, /readAnnualSpareSheet/);
    assert.equal(sheet.includes("values:batchUpdate"), false);
  });
});

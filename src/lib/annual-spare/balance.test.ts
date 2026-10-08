import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { AnnualSpareRow } from "./parse";
import {
  buildAnnualSpareBalances,
  filterAnnualSpareBalances,
  type LedgerUsageInput,
} from "./balance";

function spare(overrides: Partial<AnnualSpareRow> & { hr_code: string }): AnnualSpareRow {
  return {
    name: "Ada Collector",
    title: "Senior",
    type: "Full Time",
    total_available: 8,
    available_al_r: 2,
    available_al_c: 6,
    last_update: "01/10/2026",
    source_row_number: 2,
    ...overrides,
  };
}

function consume(hrCode: string, leaveType: "AL-R" | "AL-C"): LedgerUsageInput {
  return { hr_code: hrCode, leave_type: leaveType, action: "consume" };
}

function reverse(hrCode: string, leaveType: "AL-R" | "AL-C"): LedgerUsageInput {
  return { hr_code: hrCode, leave_type: leaveType, action: "reverse" };
}

describe("buildAnnualSpareBalances", () => {
  it("displays Annual Spare sheet values exactly as read", () => {
    const [row] = buildAnnualSpareBalances([spare({ hr_code: "A-325" })], []);
    assert.equal(row?.hr_code, "A-325");
    assert.equal(row?.name, "Ada Collector");
    assert.equal(row?.total_available, 8);
    assert.equal(row?.available_al_r, 2);
    assert.equal(row?.available_al_c, 6);
    assert.equal("used" in (row ?? {}), false);
    assert.equal("remaining" in (row ?? {}), false);
    assert.equal("used_al_r" in (row ?? {}), false);
    assert.equal("remaining_al_r" in (row ?? {}), false);
  });

  it("does not subtract ledger AL-R consumption from displayed balances", () => {
    const [row] = buildAnnualSpareBalances(
      [spare({ hr_code: "A-325" })],
      [consume("A-325", "AL-R"), consume("A-325", "AL-R")]
    );
    assert.equal(row?.total_available, 8);
    assert.equal(row?.available_al_r, 2);
    assert.equal(row?.available_al_c, 6);
  });

  it("does not subtract ledger AL-C consumption from displayed balances", () => {
    const [row] = buildAnnualSpareBalances(
      [spare({ hr_code: "A-325" })],
      [consume("A-325", "AL-C")]
    );
    assert.equal(row?.total_available, 8);
    assert.equal(row?.available_al_r, 2);
    assert.equal(row?.available_al_c, 6);
  });

  it("does not reduce displayed balances for mixed AL-R and AL-C consume days", () => {
    const [row] = buildAnnualSpareBalances(
      [spare({ hr_code: "A-325" })],
      [consume("A-325", "AL-R"), consume("A-325", "AL-C"), consume("A-325", "AL-R")]
    );
    assert.equal(row?.total_available, 8);
    assert.equal(row?.available_al_r, 2);
    assert.equal(row?.available_al_c, 6);
  });

  it("ignores reversed leave and still shows sheet values", () => {
    const [row] = buildAnnualSpareBalances(
      [spare({ hr_code: "A-325" })],
      [consume("A-325", "AL-R"), reverse("A-325", "AL-R"), reverse("A-325", "AL-C")]
    );
    assert.equal(row?.total_available, 8);
    assert.equal(row?.available_al_r, 2);
    assert.equal(row?.available_al_c, 6);
  });

  it("returns all collectors with normalized HR-Codes", () => {
    const rows = buildAnnualSpareBalances(
      [
        spare({ hr_code: "  a-325  ", name: "Ada Collector" }),
        spare({ hr_code: "B110", name: "Omar Fathy", total_available: 10, available_al_r: 4, available_al_c: 6 }),
      ],
      [consume("A-325", "AL-R"), consume("B110", "AL-C")]
    );
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.hr_code, "A-325");
    assert.equal(rows[0]?.total_available, 8);
    assert.equal(rows[0]?.available_al_r, 2);
    assert.equal(rows[1]?.hr_code, "B110");
    assert.equal(rows[1]?.total_available, 10);
    assert.equal(rows[1]?.available_al_c, 6);
  });
});

describe("filterAnnualSpareBalances", () => {
  const rows = buildAnnualSpareBalances(
    [
      spare({ hr_code: "A-325", name: "Ada Collector" }),
      spare({ hr_code: "B110", name: "Omar Fathy", total_available: 10, available_al_r: 4, available_al_c: 6 }),
    ],
    []
  );

  it("filters by HR-Code or collector name", () => {
    assert.equal(filterAnnualSpareBalances(rows, "a-325").length, 1);
    assert.equal(filterAnnualSpareBalances(rows, "a-325")[0]?.name, "Ada Collector");
    assert.equal(filterAnnualSpareBalances(rows, "omar").length, 1);
    assert.equal(filterAnnualSpareBalances(rows, "omar")[0]?.hr_code, "B110");
    assert.equal(filterAnnualSpareBalances(rows, "").length, 2);
    assert.equal(filterAnnualSpareBalances(rows, "zzz").length, 0);
  });
});

describe("admin annual spare balance wiring", () => {
  const dir = fileURLToPath(new URL(".", import.meta.url));

  it("admin Expected page loads Annual Spare balances at the top", () => {
    const source = readFileSync(join(dir, "../../app/admin/expected/ExpectedClient.tsx"), "utf8");
    assert.match(source, /\/api\/admin\/expected\/annual-spare/);
    assert.match(source, /Annual Spare/);
    assert.match(source, /HR-Code/);
    assert.match(source, /Available AL-R/);
    assert.match(source, /Available AL-C/);
    assert.match(source, /filterAnnualSpareBalances/);
    assert.equal(source.includes('"Used"'), false);
    assert.equal(source.includes('"Remaining"'), false);
    assert.equal(source.includes("row.used"), false);
    assert.equal(source.includes("row.remaining"), false);
  });

  it("admin annual spare API is admin-only and reads the sheet without ledger subtraction", () => {
    const route = readFileSync(join(dir, "../../app/api/admin/expected/annual-spare/route.ts"), "utf8");
    const queries = readFileSync(join(dir, "queries.ts"), "utf8");
    assert.match(route, /requireExpectedAdmin/);
    assert.match(route, /listAnnualSpareBalances/);
    assert.match(queries, /readAnnualSpareSheet/);
    assert.equal(queries.includes("annual_leave_ledger"), false);
    assert.equal(queries.includes("fetchConsumeLedgerRows"), false);
    assert.equal(queries.includes("batchUpdate"), false);
  });

  it("does not write Annual Spare", () => {
    const sheet = readFileSync(join(dir, "sheet.ts"), "utf8");
    assert.match(sheet, /readAnnualSpareSheet/);
    assert.equal(sheet.includes("values:batchUpdate"), false);
  });
});

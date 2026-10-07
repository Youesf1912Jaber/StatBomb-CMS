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
    total_available: 20,
    available_al_r: 12,
    available_al_c: 8,
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
  it("shows used 0 and full remaining when there is no leave", () => {
    const [row] = buildAnnualSpareBalances([spare({ hr_code: "C001" })], []);
    assert.equal(row?.hr_code, "C001");
    assert.equal(row?.used, 0);
    assert.equal(row?.used_al_r, 0);
    assert.equal(row?.used_al_c, 0);
    assert.equal(row?.remaining, 20);
    assert.equal(row?.remaining_al_r, 12);
    assert.equal(row?.remaining_al_c, 8);
  });

  it("subtracts each consumed AL-R day from remaining AL-R and total", () => {
    const [row] = buildAnnualSpareBalances(
      [spare({ hr_code: "C001" })],
      [consume("C001", "AL-R"), consume("C001", "AL-R")]
    );
    assert.equal(row?.used, 2);
    assert.equal(row?.used_al_r, 2);
    assert.equal(row?.used_al_c, 0);
    assert.equal(row?.remaining, 18);
    assert.equal(row?.remaining_al_r, 10);
    assert.equal(row?.remaining_al_c, 8);
  });

  it("subtracts each consumed AL-C day from remaining AL-C and total", () => {
    const [row] = buildAnnualSpareBalances(
      [spare({ hr_code: "C001" })],
      [consume("C001", "AL-C")]
    );
    assert.equal(row?.used, 1);
    assert.equal(row?.used_al_r, 0);
    assert.equal(row?.used_al_c, 1);
    assert.equal(row?.remaining, 19);
    assert.equal(row?.remaining_al_r, 12);
    assert.equal(row?.remaining_al_c, 7);
  });

  it("adds mixed AL-R and AL-C consume days", () => {
    const [row] = buildAnnualSpareBalances(
      [spare({ hr_code: "C001" })],
      [consume("C001", "AL-R"), consume("C001", "AL-C"), consume("C001", "AL-R")]
    );
    assert.equal(row?.used, 3);
    assert.equal(row?.used_al_r, 2);
    assert.equal(row?.used_al_c, 1);
    assert.equal(row?.remaining, 17);
    assert.equal(row?.remaining_al_r, 10);
    assert.equal(row?.remaining_al_c, 7);
  });

  it("does not count reversed leave", () => {
    const [row] = buildAnnualSpareBalances(
      [spare({ hr_code: "C001" })],
      [consume("C001", "AL-R"), reverse("C001", "AL-R"), reverse("C001", "AL-C")]
    );
    assert.equal(row?.used, 1);
    assert.equal(row?.used_al_r, 1);
    assert.equal(row?.used_al_c, 0);
    assert.equal(row?.remaining, 19);
    assert.equal(row?.remaining_al_r, 11);
    assert.equal(row?.remaining_al_c, 8);
  });

  it("normalizes HR-Code and ignores unused ledger rows for other collectors", () => {
    const rows = buildAnnualSpareBalances(
      [spare({ hr_code: "  c001  ", name: "Ada Collector" })],
      [consume("c001", "AL-R"), consume("X-999", "AL-C")]
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.hr_code, "C001");
    assert.equal(rows[0]?.used, 1);
    assert.equal(rows[0]?.remaining, 19);
  });
});

describe("filterAnnualSpareBalances", () => {
  const rows = buildAnnualSpareBalances(
    [
      spare({ hr_code: "C001", name: "Ada Collector" }),
      spare({ hr_code: "B110", name: "Omar Fathy", total_available: 10, available_al_r: 4, available_al_c: 6 }),
    ],
    []
  );

  it("filters by HR-Code or collector name", () => {
    assert.equal(filterAnnualSpareBalances(rows, "c001").length, 1);
    assert.equal(filterAnnualSpareBalances(rows, "c001")[0]?.name, "Ada Collector");
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
  });

  it("admin annual spare API is admin-only and uses consume ledger rows", () => {
    const route = readFileSync(join(dir, "../../app/api/admin/expected/annual-spare/route.ts"), "utf8");
    const queries = readFileSync(join(dir, "queries.ts"), "utf8");
    assert.match(route, /requireExpectedAdmin/);
    assert.match(route, /listAnnualSpareBalances/);
    assert.match(queries, /readAnnualSpareSheet/);
    assert.match(queries, /\.eq\("action", "consume"\)/);
    assert.equal(queries.includes("batchUpdate"), false);
  });

  it("does not change Collector Expected UI or Annual Spare writes", () => {
    const collector = readFileSync(join(dir, "../../app/collector/expected/ExpectedClient.tsx"), "utf8");
    const sheet = readFileSync(join(dir, "sheet.ts"), "utf8");
    assert.equal(collector.includes("annual-spare"), false);
    assert.equal(collector.includes("Annual Spare"), false);
    assert.match(sheet, /readAnnualSpareSheet/);
    assert.equal(sheet.includes("values:batchUpdate"), false);
  });
});

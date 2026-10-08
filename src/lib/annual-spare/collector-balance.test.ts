import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { AnnualSpareRow } from "./parse";
import {
  findAnnualSpareBalanceForHrCode,
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

const sheet = [
  spare({ hr_code: "A-325", name: "Ada Collector" }),
  spare({
    hr_code: "B110",
    name: "Omar Fathy",
    total_available: 10,
    available_al_r: 4,
    available_al_c: 6,
  }),
];

describe("findAnnualSpareBalanceForHrCode", () => {
  it("returns sheet values exactly when the collector has no leave", () => {
    const row = findAnnualSpareBalanceForHrCode(sheet, [], "A-325");
    assert.equal(row?.hr_code, "A-325");
    assert.equal(row?.total_available, 8);
    assert.equal(row?.available_al_r, 2);
    assert.equal(row?.available_al_c, 6);
    assert.equal("used" in (row ?? {}), false);
    assert.equal("remaining" in (row ?? {}), false);
  });

  it("does not subtract AL-R consume days from the displayed collector balance", () => {
    const row = findAnnualSpareBalanceForHrCode(
      sheet,
      [consume("A-325", "AL-R"), consume("A-325", "AL-R"), consume("B110", "AL-C")],
      "a-325"
    );
    assert.equal(row?.hr_code, "A-325");
    assert.equal(row?.total_available, 8);
    assert.equal(row?.available_al_r, 2);
    assert.equal(row?.available_al_c, 6);
  });

  it("does not subtract AL-C consume days from the displayed collector balance", () => {
    const row = findAnnualSpareBalanceForHrCode(sheet, [consume("A-325", "AL-C")], "A-325");
    assert.equal(row?.total_available, 8);
    assert.equal(row?.available_al_c, 6);
  });

  it("does not reduce displayed balances for mixed AL-R and AL-C consume days", () => {
    const row = findAnnualSpareBalanceForHrCode(
      sheet,
      [consume("A-325", "AL-R"), consume("A-325", "AL-C")],
      "A-325"
    );
    assert.equal(row?.total_available, 8);
    assert.equal(row?.available_al_r, 2);
    assert.equal(row?.available_al_c, 6);
  });

  it("ignores reversed leave and still shows sheet values", () => {
    const row = findAnnualSpareBalanceForHrCode(
      sheet,
      [consume("A-325", "AL-R"), reverse("A-325", "AL-R"), reverse("A-325", "AL-C")],
      "A-325"
    );
    assert.equal(row?.total_available, 8);
    assert.equal(row?.available_al_r, 2);
  });

  it("returns only the requested collector balance", () => {
    const row = findAnnualSpareBalanceForHrCode(
      sheet,
      [consume("A-325", "AL-R"), consume("B110", "AL-C")],
      "B110"
    );
    assert.equal(row?.hr_code, "B110");
    assert.equal(row?.name, "Omar Fathy");
    assert.equal(row?.total_available, 10);
    assert.equal(row?.available_al_r, 4);
    assert.equal(row?.available_al_c, 6);
  });

  it("returns null when the collector has no Annual Spare record", () => {
    assert.equal(findAnnualSpareBalanceForHrCode(sheet, [consume("X-999", "AL-R")], "X-999"), null);
    assert.equal(findAnnualSpareBalanceForHrCode(sheet, [], ""), null);
    assert.equal(findAnnualSpareBalanceForHrCode(sheet, [], "   "), null);
  });
});

describe("collector annual spare wiring", () => {
  const dir = fileURLToPath(new URL(".", import.meta.url));

  it("collector API uses session HR-Code and does not accept a client-supplied code", () => {
    const route = readFileSync(join(dir, "../../app/api/collector/expected/annual-spare/route.ts"), "utf8");
    const queries = readFileSync(join(dir, "queries.ts"), "utf8");
    assert.match(route, /requireExpectedCollector/);
    assert.match(route, /getAnnualSpareBalanceForHrCode\(access\.hr_code\)/);
    assert.equal(route.includes("searchParams"), false);
    assert.equal(route.includes("request.json"), false);
    assert.match(queries, /findAnnualSpareBalanceForHrCode/);
    assert.equal(queries.includes("fetchConsumeLedgerRows"), false);
    assert.equal(queries.includes("annual_leave_ledger"), false);
  });

  it("collector Expected page shows My Annual Spare from the collector API", () => {
    const source = readFileSync(join(dir, "../../app/collector/expected/ExpectedClient.tsx"), "utf8");
    assert.match(source, /My Annual Spare/);
    assert.match(source, /\/api\/collector\/expected\/annual-spare/);
    assert.equal(source.includes("/api/admin/expected/annual-spare"), false);
    assert.match(source, /Total Available/);
    assert.match(source, /Available AL-R/);
    assert.match(source, /Available AL-C/);
    assert.match(source, /No Annual Spare record was found for your HR-Code/);
    assert.equal(source.includes(">Used<"), false);
    assert.equal(source.includes(">Remaining<"), false);
    assert.equal(source.includes("balance.used"), false);
    assert.equal(source.includes("balance.remaining"), false);
  });

  it("does not change Admin Expected search or Annual Spare writes", () => {
    const admin = readFileSync(join(dir, "../../app/admin/expected/ExpectedClient.tsx"), "utf8");
    const sheet = readFileSync(join(dir, "sheet.ts"), "utf8");
    assert.match(admin, /\/api\/admin\/expected\/annual-spare/);
    assert.equal(admin.includes("/api/collector/expected/annual-spare"), false);
    assert.match(sheet, /readAnnualSpareSheet/);
    assert.equal(sheet.includes("values:batchUpdate"), false);
  });
});

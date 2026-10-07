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

const sheet = [
  spare({ hr_code: "C001", name: "Ada Collector" }),
  spare({
    hr_code: "B110",
    name: "Omar Fathy",
    total_available: 10,
    available_al_r: 4,
    available_al_c: 6,
  }),
];

describe("findAnnualSpareBalanceForHrCode", () => {
  it("returns used 0 and full remaining when the collector has no leave", () => {
    const row = findAnnualSpareBalanceForHrCode(sheet, [], "C001");
    assert.equal(row?.hr_code, "C001");
    assert.equal(row?.used, 0);
    assert.equal(row?.remaining, 20);
    assert.equal(row?.remaining_al_r, 12);
    assert.equal(row?.remaining_al_c, 8);
  });

  it("subtracts AL-R consume days for that collector only", () => {
    const row = findAnnualSpareBalanceForHrCode(
      sheet,
      [consume("C001", "AL-R"), consume("C001", "AL-R"), consume("B110", "AL-C")],
      "c001"
    );
    assert.equal(row?.used, 2);
    assert.equal(row?.used_al_r, 2);
    assert.equal(row?.used_al_c, 0);
    assert.equal(row?.remaining, 18);
    assert.equal(row?.remaining_al_r, 10);
    assert.equal(row?.remaining_al_c, 8);
  });

  it("subtracts AL-C consume days for that collector only", () => {
    const row = findAnnualSpareBalanceForHrCode(sheet, [consume("C001", "AL-C")], "C001");
    assert.equal(row?.used, 1);
    assert.equal(row?.used_al_c, 1);
    assert.equal(row?.remaining, 19);
    assert.equal(row?.remaining_al_c, 7);
  });

  it("adds mixed AL-R and AL-C consume days", () => {
    const row = findAnnualSpareBalanceForHrCode(
      sheet,
      [consume("C001", "AL-R"), consume("C001", "AL-C")],
      "C001"
    );
    assert.equal(row?.used, 2);
    assert.equal(row?.used_al_r, 1);
    assert.equal(row?.used_al_c, 1);
    assert.equal(row?.remaining, 18);
    assert.equal(row?.remaining_al_r, 11);
    assert.equal(row?.remaining_al_c, 7);
  });

  it("does not count reversed leave", () => {
    const row = findAnnualSpareBalanceForHrCode(
      sheet,
      [consume("C001", "AL-R"), reverse("C001", "AL-R"), reverse("C001", "AL-C")],
      "C001"
    );
    assert.equal(row?.used, 1);
    assert.equal(row?.remaining, 19);
    assert.equal(row?.remaining_al_r, 11);
  });

  it("returns only the requested collector balance", () => {
    const row = findAnnualSpareBalanceForHrCode(
      sheet,
      [consume("C001", "AL-R"), consume("B110", "AL-C")],
      "B110"
    );
    assert.equal(row?.hr_code, "B110");
    assert.equal(row?.name, "Omar Fathy");
    assert.equal(row?.used, 1);
    assert.equal(row?.used_al_c, 1);
    assert.equal(row?.remaining, 9);
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
    assert.match(route, /getAnnualSpareBalanceForHrCode\(createClient\(\), access\.hr_code\)/);
    assert.equal(route.includes("searchParams"), false);
    assert.equal(route.includes("request.json"), false);
    assert.match(queries, /findAnnualSpareBalanceForHrCode/);
    assert.match(queries, /fetchConsumeLedgerRows\(client, normalized\)/);
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
  });

  it("does not change Admin Expected balance UI or Annual Spare writes", () => {
    const admin = readFileSync(join(dir, "../../app/admin/expected/ExpectedClient.tsx"), "utf8");
    const sheet = readFileSync(join(dir, "sheet.ts"), "utf8");
    assert.match(admin, /\/api\/admin\/expected\/annual-spare/);
    assert.equal(admin.includes("/api/collector/expected/annual-spare"), false);
    assert.match(sheet, /readAnnualSpareSheet/);
    assert.equal(sheet.includes("values:batchUpdate"), false);
  });
});

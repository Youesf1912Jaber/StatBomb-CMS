import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  normalizeAnnualSpareHrCode,
  parseAnnualSpareNumber,
  parseAnnualSpareSheet,
} from "./parse";

function sampleSheet(): unknown[][] {
  return [
    ["Code", "Name", "Title", "Type", "Total available", "Available AL - R", "Available AL - C", "Last update"],
    ["c001", "Ada Collector", "Senior", "Full Time", "20", "12", "8", "01/10/2026"],
    [],
    ["  c002  ", "Bea Collector", "Junior", "Part Time", "10.5", "4", "6.5", "02/10/2026"],
  ];
}

describe("normalizeAnnualSpareHrCode", () => {
  it("trims and uppercases HR-Code", () => {
    assert.equal(normalizeAnnualSpareHrCode("  c001  "), "C001");
    assert.equal(normalizeAnnualSpareHrCode("ab-12"), "AB-12");
  });
});

describe("parseAnnualSpareNumber", () => {
  it("parses integer, decimal, thousands, and European decimal balances", () => {
    assert.equal(parseAnnualSpareNumber("20"), 20);
    assert.equal(parseAnnualSpareNumber("10.5"), 10.5);
    assert.equal(parseAnnualSpareNumber("1,234"), 1234);
    assert.equal(parseAnnualSpareNumber("12,5"), 12.5);
    assert.equal(parseAnnualSpareNumber(""), null);
    assert.equal(parseAnnualSpareNumber("—"), null);
  });
});

describe("parseAnnualSpareSheet", () => {
  it("detects headers independent of column order", () => {
    const rows = parseAnnualSpareSheet([
      ["Last update", "Available AL - C", "Name", "Code", "Total available", "Type", "Title", "Available AL - R"],
      ["01/10/2026", "8", "Ada Collector", "c001", "20", "Full Time", "Senior", "12"],
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.hr_code, "C001");
    assert.equal(rows[0]?.name, "Ada Collector");
    assert.equal(rows[0]?.title, "Senior");
    assert.equal(rows[0]?.type, "Full Time");
    assert.equal(rows[0]?.total_available, 20);
    assert.equal(rows[0]?.available_al_r, 12);
    assert.equal(rows[0]?.available_al_c, 8);
    assert.equal(rows[0]?.last_update, "01/10/2026");
  });

  it("normalizes HR-Code and preserves source row numbers", () => {
    const rows = parseAnnualSpareSheet(sampleSheet());
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.hr_code, "C001");
    assert.equal(rows[0]?.source_row_number, 2);
    assert.equal(rows[1]?.hr_code, "C002");
    assert.equal(rows[1]?.source_row_number, 4);
    assert.equal(rows[1]?.total_available, 10.5);
    assert.equal(rows[1]?.available_al_c, 6.5);
  });

  it("skips completely empty rows and rows without Code", () => {
    const rows = parseAnnualSpareSheet([
      ["Code", "Name", "Total available", "Available AL - R", "Available AL - C"],
      ["", "", "", "", ""],
      [],
      ["c010", "Zed", "5", "2", "3"],
      ["", "No Code", "9", "1", "1"],
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.hr_code, "C010");
    assert.equal(rows[0]?.source_row_number, 4);
  });
});

describe("Annual Spare sheet reader is read-only", () => {
  const dir = fileURLToPath(new URL(".", import.meta.url));

  it("reads Annual Spare server-side by GID and title without writing", () => {
    const source = readFileSync(join(dir, "sheet.ts"), "utf8");
    assert.match(source, /server-only/);
    assert.match(source, /googleRequest/);
    assert.match(source, /GOOGLE_SHEETS_ANNUAL_SPARE_TAB/);
    assert.match(source, /GOOGLE_SHEETS_ANNUAL_SPARE_GID/);
    assert.match(source, /Annual Spare/);
    assert.match(source, /1684938117/);
    assert.match(source, /FORMATTED_VALUE/);
    assert.match(source, /A:Z/);
    assert.equal(source.includes("batchUpdate"), false);
    assert.equal(source.includes(":append"), false);
    assert.equal(source.includes("valueInputOption"), false);
    assert.equal(source.includes("method: \"POST\""), false);
    assert.equal(source.includes("method: \"PUT\""), false);
    assert.equal(source.includes("method: \"PATCH\""), false);
  });
});

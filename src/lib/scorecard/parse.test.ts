import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  SCORECARD_EMPTY_SHEET_ERROR,
  SCORECARD_MISSING_IDENTITY_ERROR,
  normalizeScorecardHeader,
  parseScorecardSheet,
  resolveScorecardIdentityIndexes,
  ScorecardParseError,
} from "./parse";

function identityHeaders(): unknown[] {
  return ["Month", "HR Code", "Name", "Team", "Type"];
}

function sampleHeaders(): unknown[] {
  return [
    ...identityHeaders(),
    "Email",
    "Title",
    "Status",
    "Tenure",
    "Base",
    "Base Point",
    "Extras Score",
    "Extras Point",
    "Location Score",
    "Location Point",
  ];
}

function sampleRow(hrCode = "A-100"): unknown[] {
  return [
    "Oct 2026",
    hrCode,
    "Ada Collector",
    "Team A",
    "Full Time",
    "ada@example.com",
    "Senior",
    "Active",
    "12",
    "80%",
    "8",
    "12.5",
    "4",
    "90%",
    "6",
  ];
}

describe("normalizeScorecardHeader", () => {
  it("trims, lowercases, and collapses punctuation for matching", () => {
    assert.equal(normalizeScorecardHeader("  HR Code  "), "hr code");
    assert.equal(normalizeScorecardHeader("HR-Code"), "hr code");
    assert.equal(normalizeScorecardHeader("HRCODE"), "hrcode");
    assert.equal(normalizeScorecardHeader("Month"), "month");
  });
});

describe("parseScorecardSheet", () => {
  it("reads the current Scorecard headers in sheet order", () => {
    const data = parseScorecardSheet([sampleHeaders(), sampleRow()]);
    assert.deepEqual(data.headers, [
      "Month",
      "HR Code",
      "Name",
      "Team",
      "Type",
      "Email",
      "Title",
      "Status",
      "Tenure",
      "Base",
      "Base Point",
      "Extras Score",
      "Extras Point",
      "Location Score",
      "Location Point",
    ]);
    assert.equal(data.rows.length, 1);
    assert.equal(data.rows[0]?.cells.length, data.headers.length);
  });

  it("detects all 5 identity fields by header name", () => {
    const data = parseScorecardSheet([sampleHeaders(), sampleRow("a-100")]);
    const identity = data.rows[0]?.identity;
    assert.equal(identity?.month, "Oct 2026");
    assert.equal(identity?.hr_code, "a-100");
    assert.equal(identity?.name, "Ada Collector");
    assert.equal(identity?.team, "Team A");
    assert.equal(identity?.type, "Full Time");
  });

  it("accepts identity header aliases", () => {
    const data = parseScorecardSheet([
      ["month", "hr-code", "collector name", "team name", "type", "Base"],
      ["Sep 2026", "B-200", "Bea", "Team B", "Part Time", "70%"],
    ]);
    assert.equal(data.rows[0]?.identity.month, "Sep 2026");
    assert.equal(data.rows[0]?.identity.hr_code, "B-200");
    assert.equal(data.rows[0]?.identity.name, "Bea");
    assert.equal(data.rows[0]?.identity.team, "Team B");
    assert.equal(data.rows[0]?.identity.type, "Part Time");
    assert.equal(data.headers[1], "hr-code");
    assert.equal(data.rows[0]?.cells[5], "70%");
  });

  it("matches identity headers with case and whitespace differences", () => {
    const data = parseScorecardSheet([
      [" MONTH ", "Hr Code", "NAME", "  Team  ", "Type", "Quality Score"],
      ["Aug 2026", "c-300", "Cara", "Team C", "Contract", "95%"],
    ]);
    const indexes = resolveScorecardIdentityIndexes([
      " MONTH ",
      "Hr Code",
      "NAME",
      "  Team  ",
      "Type",
      "Quality Score",
    ]);
    assert.ok(indexes);
    assert.equal(indexes.month, 0);
    assert.equal(indexes.hrCode, 1);
    assert.equal(indexes.name, 2);
    assert.equal(indexes.team, 3);
    assert.equal(indexes.type, 4);
    assert.equal(data.rows[0]?.identity.hr_code, "c-300");
    assert.equal(data.headers[5], "Quality Score");
  });

  it("keeps all dynamic KPI columns aligned with headers", () => {
    const data = parseScorecardSheet([sampleHeaders(), sampleRow()]);
    const row = data.rows[0];
    assert.ok(row);
    assert.equal(row.cells[5], "ada@example.com");
    assert.equal(row.cells[9], "80%");
    assert.equal(row.cells[11], "12.5");
    assert.equal(row.cells[13], "90%");
    assert.equal(typeof row.cells[9], "string");
    assert.equal(typeof row.cells[11], "string");
  });

  it("includes a newly added KPI column without code changes", () => {
    const headers = [...sampleHeaders(), "New KPI", "Quality Score"];
    const row = [...sampleRow(), "11", "88%"];
    const data = parseScorecardSheet([headers, row]);
    assert.equal(data.headers.at(-2), "New KPI");
    assert.equal(data.headers.at(-1), "Quality Score");
    assert.equal(data.rows[0]?.cells.at(-2), "11");
    assert.equal(data.rows[0]?.cells.at(-1), "88%");
  });

  it("drops a removed KPI column automatically", () => {
    const withExtras = parseScorecardSheet([sampleHeaders(), sampleRow()]);
    assert.ok(withExtras.headers.includes("Extras Score"));

    const headers = sampleHeaders().filter((header) => header !== "Extras Score" && header !== "Extras Point");
    const row = sampleRow();
    row.splice(11, 2);
    const withoutExtras = parseScorecardSheet([headers, row]);
    assert.equal(withoutExtras.headers.includes("Extras Score"), false);
    assert.equal(withoutExtras.headers.includes("Extras Point"), false);
    assert.equal(withoutExtras.headers.includes("Location Score"), true);
    assert.equal(withoutExtras.rows[0]?.cells.length, withoutExtras.headers.length);
  });

  it("preserves reordered KPI columns", () => {
    const data = parseScorecardSheet([
      ["Month", "HR Code", "Name", "Team", "Type", "Location Score", "Base", "Extras Score"],
      ["Oct 2026", "A-100", "Ada", "Team A", "Full Time", "90%", "80%", "12.5"],
    ]);
    assert.deepEqual(data.headers.slice(5), ["Location Score", "Base", "Extras Score"]);
    assert.deepEqual(data.rows[0]?.cells.slice(5), ["90%", "80%", "12.5"]);
  });

  it("finds identity columns after they are physically reordered", () => {
    const data = parseScorecardSheet([
      ["Type", "Team", "Name", "HR Code", "Month", "Base", "Quality Score"],
      ["Full Time", "Team A", "Ada", "A-100", "Oct 2026", "80%", "99%"],
    ]);
    assert.deepEqual(data.headers, ["Type", "Team", "Name", "HR Code", "Month", "Base", "Quality Score"]);
    assert.equal(data.rows[0]?.identity.month, "Oct 2026");
    assert.equal(data.rows[0]?.identity.hr_code, "A-100");
    assert.equal(data.rows[0]?.identity.name, "Ada");
    assert.equal(data.rows[0]?.identity.team, "Team A");
    assert.equal(data.rows[0]?.identity.type, "Full Time");
    assert.equal(data.rows[0]?.cells[5], "80%");
    assert.equal(data.rows[0]?.cells[6], "99%");
  });

  it("keeps duplicate headers and does not overwrite cells", () => {
    const data = parseScorecardSheet([
      ["Month", "HR Code", "Name", "Team", "Type", "Score", "Score"],
      ["Oct 2026", "A-100", "Ada", "Team A", "Full Time", "10", "20"],
    ]);
    assert.deepEqual(data.headers, ["Month", "HR Code", "Name", "Team", "Type", "Score", "Score"]);
    assert.equal(data.rows[0]?.cells[5], "10");
    assert.equal(data.rows[0]?.cells[6], "20");
  });

  it("preserves blank KPI cells as empty strings", () => {
    const data = parseScorecardSheet([
      ["Month", "HR Code", "Name", "Team", "Type", "Base", "Extras Score"],
      ["Oct 2026", "A-100", "Ada", "Team A", "Full Time", "", "12.5"],
    ]);
    assert.equal(data.rows[0]?.cells[5], "");
    assert.equal(data.rows[0]?.cells[6], "12.5");
    assert.equal(data.rows.length, 1);
  });

  it("keeps rows with a blank HR-Code", () => {
    const data = parseScorecardSheet([
      ["Month", "HR Code", "Name", "Team", "Type", "Base"],
      ["Oct 2026", "", "Ada", "Team A", "Full Time", "80%"],
    ]);
    assert.equal(data.rows.length, 1);
    assert.equal(data.rows[0]?.identity.hr_code, "");
    assert.equal(data.rows[0]?.identity.name, "Ada");
    assert.equal(data.rows[0]?.cells[5], "80%");
  });

  it("preserves duplicate HR-Code rows for the same month", () => {
    const data = parseScorecardSheet([
      ["Month", "HR Code", "Name", "Team", "Type", "Base"],
      ["Oct 2026", "A-100", "Ada", "Team A", "Full Time", "80%"],
      ["Oct 2026", "A-100", "Ada", "Team A", "Full Time", "81%"],
    ]);
    assert.equal(data.rows.length, 2);
    assert.equal(data.rows[0]?.cells[5], "80%");
    assert.equal(data.rows[1]?.cells[5], "81%");
  });

  it("skips completely empty rows but keeps partially filled rows", () => {
    const data = parseScorecardSheet([
      ["Month", "HR Code", "Name", "Team", "Type", "Base"],
      [],
      ["", "", "", "", "", ""],
      ["Oct 2026", "A-100", "Ada", "Team A", "Full Time", ""],
      ["", "", "", "", "", ""],
    ]);
    assert.equal(data.rows.length, 1);
    assert.equal(data.rows[0]?.identity.hr_code, "A-100");
    assert.equal(data.rows[0]?.cells[5], "");
  });

  it("trims trailing empty header columns without dropping inner blanks", () => {
    const data = parseScorecardSheet([
      ["Month", "HR Code", "Name", "Team", "Type", "Base", "", "", ""],
      ["Oct 2026", "A-100", "Ada", "Team A", "Full Time", "80%", "", "x", ""],
    ]);
    assert.deepEqual(data.headers, ["Month", "HR Code", "Name", "Team", "Type", "Base"]);
    assert.equal(data.rows[0]?.cells.length, 6);
    assert.equal(data.rows[0]?.cells[5], "80%");
  });

  it("keeps FORMATTED_VALUE strings such as percentages and numbers", () => {
    const data = parseScorecardSheet([
      ["Month", "HR Code", "Name", "Team", "Type", "Base", "Tenure", "Status"],
      ["Oct 2026", "A-100", "Ada", "Team A", "Full Time", "80%", "12.5", "Active"],
    ]);
    assert.equal(data.rows[0]?.cells[5], "80%");
    assert.equal(data.rows[0]?.cells[6], "12.5");
    assert.equal(data.rows[0]?.cells[7], "Active");
    assert.equal(typeof data.rows[0]?.cells[5], "string");
    assert.equal(typeof data.rows[0]?.cells[6], "string");
  });

  it("fails clearly when a required identity header is missing", () => {
    assert.throws(
      () =>
        parseScorecardSheet([
          ["Month", "Name", "Team", "Type", "Base"],
          ["Oct 2026", "Ada", "Team A", "Full Time", "80%"],
        ]),
      (error: unknown) => {
        assert.ok(error instanceof ScorecardParseError);
        assert.equal(error.message, SCORECARD_MISSING_IDENTITY_ERROR);
        return true;
      }
    );
  });

  it("fails clearly when the sheet has no header row", () => {
    assert.throws(
      () => parseScorecardSheet([]),
      (error: unknown) => {
        assert.ok(error instanceof ScorecardParseError);
        assert.equal(error.message, SCORECARD_EMPTY_SHEET_ERROR);
        return true;
      }
    );
  });

  it("supports columns beyond AZ by keeping cells aligned with headers", () => {
    const headers: unknown[] = ["Month", "HR Code", "Name", "Team", "Type"];
    const row: unknown[] = ["Oct 2026", "A-100", "Ada", "Team A", "Full Time"];
    for (let i = 0; i < 60; i += 1) {
      headers.push(`KPI ${i + 1}`);
      row.push(`${i + 1}%`);
    }
    const data = parseScorecardSheet([headers, row]);
    assert.equal(data.headers.length, 65);
    assert.equal(data.headers[52], "KPI 48");
    assert.equal(data.headers[64], "KPI 60");
    assert.equal(data.rows[0]?.cells[52], "48%");
    assert.equal(data.rows[0]?.cells[64], "60%");
    assert.equal(data.rows[0]?.cells.length, 65);
  });
});

describe("Scorecard sheet reader is read-only and full-tab", () => {
  const dir = fileURLToPath(new URL(".", import.meta.url));

  it("reads Scorecard by GID and title with FORMATTED_VALUE and no writes", () => {
    const source = readFileSync(join(dir, "sheet.ts"), "utf8");
    assert.match(source, /server-only/);
    assert.match(source, /googleRequest/);
    assert.match(source, /GOOGLE_SHEETS_SCORECARD_TAB/);
    assert.match(source, /GOOGLE_SHEETS_SCORECARD_GID/);
    assert.match(source, /Scorecard/);
    assert.match(source, /1525808006/);
    assert.match(source, /FORMATTED_VALUE/);
    assert.match(source, /quotedSheetTitle/);
    assert.equal(source.includes("A:AZ"), false);
    assert.equal(source.includes("A:Z"), false);
    assert.equal(source.includes("A:ZZ"), false);
    assert.equal(source.includes("batchUpdate"), false);
    assert.equal(source.includes(":append"), false);
    assert.equal(source.includes("valueInputOption"), false);
    assert.equal(source.includes('method: "POST"'), false);
    assert.equal(source.includes('method: "PUT"'), false);
    assert.equal(source.includes('method: "PATCH"'), false);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ScorecardRow } from "./types";
import {
  SCORECARD_ALL_MONTHS,
  displayScorecardCell,
  distinctScorecardMonths,
  filterScorecardRowsByMonth,
  resolveScorecardMonthSelection,
  scorecardTableCells,
} from "./view";

function row(month: string, hrCode: string, extra: string[] = ["80%"]): ScorecardRow {
  return {
    identity: {
      month,
      hr_code: hrCode,
      name: "Ada",
      team: "Team A",
      type: "Full Time",
    },
    cells: [month, hrCode, "Ada", "Team A", "Full Time", ...extra],
  };
}

describe("displayScorecardCell", () => {
  it("shows an em dash for blank cells", () => {
    assert.equal(displayScorecardCell(""), "—");
    assert.equal(displayScorecardCell("   "), "—");
    assert.equal(displayScorecardCell(null), "—");
    assert.equal(displayScorecardCell(undefined), "—");
  });

  it("preserves API values exactly", () => {
    assert.equal(displayScorecardCell("97.13%"), "97.13%");
    assert.equal(displayScorecardCell("⚠️ Escalated to HR"), "⚠️ Escalated to HR");
    assert.equal(displayScorecardCell(" 80% "), " 80% ");
  });
});

describe("distinctScorecardMonths", () => {
  it("returns distinct months in first-seen order without parsing dates", () => {
    const months = distinctScorecardMonths([
      row("Oct 2026", "A-1"),
      row("Sep 2026", "A-2"),
      row("Oct 2026", "A-3"),
      row("Jan 2026", "A-4"),
    ]);
    assert.deepEqual(months, ["Oct 2026", "Sep 2026", "Jan 2026"]);
  });

  it("skips empty month values", () => {
    assert.deepEqual(distinctScorecardMonths([row("", "A-1"), row("Oct 2026", "A-2")]), ["Oct 2026"]);
  });
});

describe("filterScorecardRowsByMonth", () => {
  const rows = [row("Oct 2026", "A-1"), row("Sep 2026", "A-2"), row("Oct 2026", "A-3")];

  it("returns all rows for All months", () => {
    assert.equal(filterScorecardRowsByMonth(rows, SCORECARD_ALL_MONTHS).length, 3);
  });

  it("filters to the selected month string", () => {
    const filtered = filterScorecardRowsByMonth(rows, "Oct 2026");
    assert.equal(filtered.length, 2);
    assert.ok(filtered.every((item) => item.identity.month === "Oct 2026"));
  });

  it("can produce zero matching rows while source rows remain", () => {
    const filtered = filterScorecardRowsByMonth(rows, "Feb 2026");
    assert.equal(rows.length, 3);
    assert.equal(filtered.length, 0);
  });
});

describe("resolveScorecardMonthSelection", () => {
  it("keeps the selected month when it still exists after refresh", () => {
    assert.equal(resolveScorecardMonthSelection("Oct 2026", ["Sep 2026", "Oct 2026"]), "Oct 2026");
  });

  it("falls back to All months when the selected month disappears", () => {
    assert.equal(resolveScorecardMonthSelection("Oct 2026", ["Sep 2026"]), SCORECARD_ALL_MONTHS);
  });

  it("keeps All months", () => {
    assert.equal(resolveScorecardMonthSelection(SCORECARD_ALL_MONTHS, ["Oct 2026"]), SCORECARD_ALL_MONTHS);
  });
});

describe("scorecardTableCells", () => {
  it("renders headers dynamically and keeps cells aligned", () => {
    const headers = ["Month", "HR Code", "Name", "Team", "Type", "Base", "Quality Score"];
    const rows = [row("Oct 2026", "A-1", ["80%", "99%"])];
    assert.deepEqual(scorecardTableCells(headers, rows), [
      ["Oct 2026", "A-1", "Ada", "Team A", "Full Time", "80%", "99%"],
    ]);
  });

  it("shows a newly added KPI header without code changes", () => {
    const headers = ["Month", "HR Code", "Name", "Team", "Type", "Base", "New KPI"];
    const rows = [row("Oct 2026", "A-1", ["80%", "11"])];
    const cells = scorecardTableCells(headers, rows)[0];
    assert.equal(headers.at(-1), "New KPI");
    assert.equal(cells?.at(-1), "11");
  });

  it("drops a removed KPI header", () => {
    const headers = ["Month", "HR Code", "Name", "Team", "Type", "Base"];
    const rows = [row("Oct 2026", "A-1", ["80%", "12.5"])];
    const cells = scorecardTableCells(headers, rows)[0];
    assert.equal(headers.includes("Extras Score"), false);
    assert.deepEqual(cells, ["Oct 2026", "A-1", "Ada", "Team A", "Full Time", "80%"]);
  });

  it("follows reordered headers", () => {
    const headers = ["Type", "Team", "Name", "HR Code", "Month", "Quality Score", "Base"];
    const rows: ScorecardRow[] = [
      {
        identity: {
          month: "Oct 2026",
          hr_code: "A-1",
          name: "Ada",
          team: "Team A",
          type: "Full Time",
        },
        cells: ["Full Time", "Team A", "Ada", "A-1", "Oct 2026", "99%", "80%"],
      },
    ];
    assert.deepEqual(scorecardTableCells(headers, rows)[0], [
      "Full Time",
      "Team A",
      "Ada",
      "A-1",
      "Oct 2026",
      "99%",
      "80%",
    ]);
  });

  it("displays blank cells as an em dash", () => {
    const headers = ["Month", "HR Code", "Name", "Team", "Type", "Base", "Quality Score"];
    const rows = [row("Oct 2026", "A-1", ["", "97.13%"])];
    assert.deepEqual(scorecardTableCells(headers, rows)[0]?.slice(5), ["—", "97.13%"]);
  });

  it("replaces headers and rows after refresh", () => {
    const beforeHeaders = ["Month", "HR Code", "Name", "Team", "Type", "Base"];
    const afterHeaders = ["Month", "HR Code", "Name", "Team", "Type", "Quality Score", "Base"];
    const beforeRows = [row("Oct 2026", "A-1", ["80%"])];
    const afterRows = [row("Sep 2026", "B-2", ["99%", "70%"])];
    assert.deepEqual(scorecardTableCells(beforeHeaders, beforeRows)[0]?.at(-1), "80%");
    assert.deepEqual(scorecardTableCells(afterHeaders, afterRows), [
      ["Sep 2026", "B-2", "Ada", "Team A", "Full Time", "99%", "70%"],
    ]);
  });
});

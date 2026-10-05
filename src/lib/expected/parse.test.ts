import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { columnLetter, parseExpectedWeeklyBlocks, parseSheetDate } from "./parse";

function sparseHeader(): unknown[] {
  return [
    "Hr-Code",
    "Collector",
    "Type",
    "Sunday",
    "",
    "Monday",
    "",
    "Tuesday",
    "",
    "Wednesday",
    "",
    "Thursday",
    "",
    "Friday",
    "",
    "Saturday",
  ];
}

function sparseDates(sunday: string): unknown[] {
  const days = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(`${sunday}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  });
  return [
    "",
    "",
    "",
    days[0],
    "",
    days[1],
    "",
    days[2],
    "",
    days[3],
    "",
    days[4],
    "",
    days[5],
    "",
    days[6],
  ];
}

function sparseCollector(
  hrCode: string,
  name: string,
  type: string,
  values: string[],
  extras: unknown[] = []
): unknown[] {
  return [
    hrCode,
    name,
    type,
    values[0],
    "",
    values[1],
    "",
    values[2],
    "",
    values[3],
    "",
    values[4],
    "",
    values[5],
    "",
    values[6],
    "5",
    "4.5",
    "4.25",
    ...extras,
  ];
}

function adjacentHeader(): unknown[] {
  return [
    "Hr-Code",
    "Collector",
    "Type",
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "",
    "",
    "",
    "AL R",
    "UL",
    "SL",
    "Total absence",
    "Total shifts all team",
  ];
}

function adjacentDates(sunday: string): unknown[] {
  const days = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(`${sunday}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  });
  return ["", "", "", ...days, "", "", "", "1", "0", "0", "1", "12"];
}

function adjacentCollector(
  hrCode: string,
  name: string,
  type: string,
  values: string[]
): unknown[] {
  return [hrCode, name, type, ...values, "4", "3.5", "3.25"];
}

function productionLikeMatrix(): unknown[][] {
  const rows: unknown[][] = [];

  rows.push(sparseHeader());
  rows.push([]);
  rows.push(sparseDates("2025-12-07"));
  rows.push(
    sparseCollector("A-325", "Ahmed Ghanem", "Full", ["0.75", "0.75", "0.75", "0.75", "0.5", "WV", "WV"], [
      "Total absence",
      "2",
      "Total shifts all team",
      "10",
      "expected shift matches",
      "8",
      "over target",
      "0",
      "diff",
      "0",
    ])
  );
  rows.push(sparseCollector("A-401", "Sara Nabil", "Part", ["0.5", "0.5", "0.5", "0.5", "0.5", "0.5", "0"]));
  rows.push(["Count-M1", "", "", "2", "", "2", "", "2", "", "2", "", "2", "", "1", "", "0"]);
  rows.push(["Sum-M1", "", "", "1.25", "", "1.25", "", "1.25", "", "1.25", "", "1", "", "0.5", "", "0"]);
  rows.push(["Actual-M1", "", "", "1.25", "", "1.2", "", "1.2", "", "1.2", "", "1", "", "0.5", "", "0"]);

  while (rows.length < 20) rows.push([]);

  rows.push(["random note", "2026-01-04", "not a week"]);
  rows.push(["01/01/2026", "02/01/2026", "03/01/2026"]);

  while (rows.length < 40) rows.push([]);

  rows.push(["Overnight 2"]);
  rows.push(adjacentHeader());
  rows.push(adjacentDates("2026-05-03"));
  rows.push(adjacentCollector("B-110", "Omar Fathy", "Full", ["1", "1", "1", "0.75", "0.75", "WV", "WV"]));
  rows.push(adjacentCollector("B-111", "Lina Adel", "Full", ["0.75", "0.75", "0.75", "0.75", "0.75", "0.5", "0"]));
  rows.push(["Count-M1", "", "", "2", "2", "2", "2", "2", "1", "0"]);
  rows.push(["Sum-M1", "", "", "1.75", "1.75", "1.75", "1.5", "1.5", "0.5", "0"]);
  rows.push(["Actual-M1", "", "", "1.7", "1.7", "1.7", "1.5", "1.5", "0.5", "0"]);

  while (rows.length < 80) rows.push([]);

  rows.push(["Hr-Code", "Collector", "Type", "Sunday", "Monday", "Tuesday"]);
  rows.push(["", "", "", "2026-06-01", "2026-06-02", "2026-06-03"]);
  rows.push(["C-1", "Partial Block", "Full", "1", "1", "1"]);
  rows.push(["Count-M1"]);

  while (rows.length < 1020) rows.push([]);

  rows.push(["Morning 1"]);
  rows.push(adjacentHeader());
  rows.push(adjacentDates("2026-08-16"));
  rows.push(adjacentCollector("A-325", "Ahmed Ghanem", "Full", ["0.75", "0.75", "0.75", "0.75", "0.5", "WV", "WV"]));
  rows.push(adjacentCollector("A-410", "Nour Hassan", "Full", ["1", "1", "1", "1", "1", "0.5", "0"]));
  rows.push(["Count-M1", "", "", "2", "2", "2", "2", "2", "1", "0"]);
  rows.push(["Sum-M1", "", "", "1.75", "1.75", "1.75", "1.75", "1.5", "0.5", "0"]);
  rows.push(["Actual-M1", "", "", "1.7", "1.7", "1.7", "1.7", "1.5", "0.5", "0"]);

  while (rows.length < 1100) rows.push([]);

  rows.push(adjacentHeader());
  rows.push([]);
  rows.push(adjacentDates("2026-08-23"));
  rows.push(adjacentCollector("D-900", "No Shift Collector", "Full", ["1", "1", "1", "1", "1", "1", "1"]));
  rows.push(["Count-M1", "", "", "1", "1", "1", "1", "1", "1", "1"]);
  rows.push(["Sum-M1", "", "", "1", "1", "1", "1", "1", "1", "1"]);
  rows.push(["Actual-M1", "", "", "1", "1", "1", "1", "1", "1", "1"]);

  rows.push(["Hr-Code", "Collector", "Type", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);
  rows.push(["", "", "", "2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12"]);
  rows.push(["Count-M1"]);
  rows.push(["Sum-M1"]);
  rows.push(["Actual-M1"]);

  return rows;
}

describe("parseSheetDate", () => {
  it("parses ISO YYYY-MM-DD without shifting the calendar day", () => {
    assert.equal(parseSheetDate("2026-08-16"), "2026-08-16");
    assert.equal(parseSheetDate("2026-08-22"), "2026-08-22");
    assert.equal(parseSheetDate("2026-05-03"), "2026-05-03");
    assert.equal(parseSheetDate("2025-12-07"), "2025-12-07");
  });

  it("parses DD/MM/YYYY", () => {
    assert.equal(parseSheetDate("16/08/2026"), "2026-08-16");
    assert.equal(parseSheetDate("03/05/2026"), "2026-05-03");
  });
});

describe("parseExpectedWeeklyBlocks", () => {
  const weeks = parseExpectedWeeklyBlocks(productionLikeMatrix());

  it("detects each valid weekly block and ignores invalid ones", () => {
    assert.equal(weeks.length, 4);
    assert.deepEqual(
      weeks.map((week) => [week.week_start_date, week.week_end_date, week.shift_name]),
      [
        ["2026-08-23", "2026-08-29", null],
        ["2026-08-16", "2026-08-22", "Morning 1"],
        ["2026-05-03", "2026-05-09", "Overnight 2"],
        ["2025-12-07", "2025-12-13", null],
      ]
    );
  });

  it("maps sparse alternating weekday columns to the real sheet coordinates", () => {
    const week = weeks.find((item) => item.week_start_date === "2025-12-07");
    assert.ok(week);
    assert.equal(week.header_row, 1);
    assert.equal(week.columns.days.sunday, 3);
    assert.equal(week.columns.days.monday, 5);
    assert.equal(week.columns.days.saturday, 15);
    assert.equal(columnLetter(week.columns.days.sunday), "D");
    assert.equal(week.week_start_cell?.row, 3);
    assert.equal(week.week_start_cell?.column, 3);
    assert.equal(week.week_start_cell?.column_letter, "D");
    assert.equal(week.week_end_cell?.value, "2025-12-13");
    assert.equal(week.collectors.length, 2);
    assert.equal(week.collectors[0]?.hr_code.value, "A-325");
    assert.equal(week.collectors[0]?.row_number, 4);
    assert.equal(week.collectors[0]?.days.sunday.value, "0.75");
    assert.equal(week.collectors[0]?.days.friday.value, "WV");
    assert.equal(week.collectors[0]?.days.sunday.column, 3);
    assert.equal(week.collectors[0]?.days.monday.column, 5);
    assert.equal(week.collectors[0]?.count_m1.value, "5");
    assert.equal(week.collectors[0]?.sum_m1.value, "4.5");
    assert.equal(week.collectors[0]?.actual_m1.value, "4.25");
    assert.equal(week.summary.total_absence?.value, "2");
    assert.equal(week.summary.total_shifts_all_team?.value, "10");
    assert.equal(week.summary.expected_shift_matches?.value, "8");
  });

  it("keeps Morning 1 / Overnight 2 blocks independent", () => {
    const morning = weeks.find((item) => item.week_start_date === "2026-08-16");
    const overnight = weeks.find((item) => item.week_start_date === "2026-05-03");
    assert.ok(morning);
    assert.ok(overnight);
    assert.equal(morning.shift_name, "Morning 1");
    assert.equal(overnight.shift_name, "Overnight 2");
    assert.equal(morning.collectors.length, 2);
    assert.equal(overnight.collectors.length, 2);
    assert.equal(morning.header_row, 1022);
    assert.ok(morning.collectors.every((row) => row.hr_code.value !== "Omar Fathy"));
    assert.ok(overnight.collectors.every((row) => row.collector.value !== "Ahmed Ghanem" || row.hr_code.value !== "A-410"));
  });

  it("parses a week that has no shift row", () => {
    const week = weeks.find((item) => item.week_start_date === "2026-08-23");
    assert.ok(week);
    assert.equal(week.shift_name, null);
    assert.equal(week.collectors[0]?.collector.value, "No Shift Collector");
    assert.deepEqual(week.daily_shifts, {
      sunday: null,
      monday: null,
      tuesday: null,
      wednesday: null,
      thursday: null,
      friday: null,
      saturday: null,
    });
  });

  it("reads per-day shifts including mid-week changes", () => {
    const mixed = parseExpectedWeeklyBlocks([
      ["", "", "", "Overnight 2", "Overnight 2", "Overnight 2", "Overnight 2", "Overnight 2", "Overnight 2", "Overnight 1"],
      adjacentHeader(),
      adjacentDates("2026-09-06"),
      adjacentCollector("A-325", "Ahmed Ghanem", "Full", ["1", "1", "1", "1", "1", "1", "0.5"]),
      ["Count-M1", "", "", "1", "1", "1", "1", "1", "1", "1"],
      ["Sum-M1", "", "", "1", "1", "1", "1", "1", "1", "0.5"],
      ["Actual-M1", "", "", "1", "1", "1", "1", "1", "1", "0.5"],
    ]);
    assert.equal(mixed.length, 1);
    assert.equal(mixed[0]?.week_start_date, "2026-09-06");
    assert.equal(mixed[0]?.week_end_date, "2026-09-12");
    assert.deepEqual(mixed[0]?.daily_shifts, {
      sunday: "Overnight 2",
      monday: "Overnight 2",
      tuesday: "Overnight 2",
      wednesday: "Overnight 2",
      thursday: "Overnight 2",
      friday: "Overnight 2",
      saturday: "Overnight 1",
    });
  });

  it("fills merged weekday shift cells forward across empty day columns", () => {
    const merged = parseExpectedWeeklyBlocks([
      ["", "", "", "Overnight 2", "", "", "", "", "", "Overnight 1"],
      adjacentHeader(),
      adjacentDates("2026-08-23"),
      adjacentCollector("D-900", "No Shift Collector", "Full", ["1", "1", "1", "1", "1", "1", "1"]),
      ["Count-M1", "", "", "1", "1", "1", "1", "1", "1", "1"],
      ["Sum-M1", "", "", "1", "1", "1", "1", "1", "1", "1"],
      ["Actual-M1", "", "", "1", "1", "1", "1", "1", "1", "1"],
    ]);
    assert.equal(merged.length, 1);
    assert.deepEqual(merged[0]?.daily_shifts, {
      sunday: "Overnight 2",
      monday: "Overnight 2",
      tuesday: "Overnight 2",
      wednesday: "Overnight 2",
      thursday: "Overnight 2",
      friday: "Overnight 2",
      saturday: "Overnight 1",
    });
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calendarDatesEqual,
  compareCalendarDates,
  isCurrentShiftDate,
  isOnOrAfterCalendarDate,
  isUpcomingShiftDate,
  parseCalendarDate,
} from "./dates";

describe("parseCalendarDate MDY (Distribution)", () => {
  it("treats 2026-10-09 and 10/9/2026 as the same calendar day", () => {
    assert.equal(parseCalendarDate("2026-10-09", "mdy"), "2026-10-09");
    assert.equal(parseCalendarDate("10/9/2026", "mdy"), "2026-10-09");
    assert.equal(calendarDatesEqual("2026-10-09", "10/9/2026", "mdy"), true);
  });

  it("keeps 2026-09-09 as September 9, not October 9", () => {
    assert.equal(parseCalendarDate("2026-09-09", "mdy"), "2026-09-09");
    assert.equal(parseCalendarDate("9/9/2026", "mdy"), "2026-09-09");
    assert.notEqual(parseCalendarDate("2026-09-09", "mdy"), "2026-10-09");
    assert.equal(calendarDatesEqual("2026-09-09", "10/9/2026", "mdy"), false);
  });

  it("parses 9/28/2026 as September 28 under MDY", () => {
    assert.equal(parseCalendarDate("9/28/2026", "mdy"), "2026-09-28");
  });

  it("rejects invalid calendar dates", () => {
    assert.equal(parseCalendarDate("2/30/2026", "mdy"), null);
    assert.equal(parseCalendarDate("13/1/2026", "mdy"), null);
    assert.equal(parseCalendarDate("2026-02-30", "mdy"), null);
    assert.equal(parseCalendarDate("2026-13-01", "mdy"), null);
    assert.equal(parseCalendarDate("not a date", "mdy"), null);
    assert.equal(parseCalendarDate("", "mdy"), null);
    assert.equal(parseCalendarDate(null, "mdy"), null);
  });

  it("does not swap month and day for unambiguous MDY values", () => {
    assert.equal(parseCalendarDate("1/2/2026", "mdy"), "2026-01-02");
    assert.equal(parseCalendarDate("2/1/2026", "mdy"), "2026-02-01");
  });
});

describe("Current Shift and Upcoming", () => {
  it("Current Shift matches ISO and MDY for the same Cairo day", () => {
    assert.equal(isCurrentShiftDate("2026-10-09", "2026-10-09"), true);
    assert.equal(isCurrentShiftDate("10/9/2026", "2026-10-09"), true);
    assert.equal(isCurrentShiftDate("10/09/2026", "2026-10-09"), true);
    assert.equal(isCurrentShiftDate("2026-09-09", "2026-10-09"), false);
    assert.equal(isCurrentShiftDate("9/9/2026", "2026-10-09"), false);
    assert.equal(isCurrentShiftDate(null, "2026-10-09"), false);
    assert.equal(isCurrentShiftDate("2/30/2026", "2026-02-28"), false);
  });

  it("Upcoming uses calendar order, not MDY string lexicography", () => {
    assert.equal(isUpcomingShiftDate("2026-10-10", "2026-10-09"), true);
    assert.equal(isUpcomingShiftDate("10/10/2026", "2026-10-09"), true);
    assert.equal(isUpcomingShiftDate("9/28/2026", "2026-09-09"), true);
    assert.equal(isUpcomingShiftDate("2026-10-09", "2026-10-09"), false);
    assert.equal(isUpcomingShiftDate("10/9/2026", "2026-10-09"), false);
    assert.equal(isUpcomingShiftDate("2026-10-08", "2026-10-09"), false);
    assert.equal(isUpcomingShiftDate("9/8/2026", "2026-10-09"), false);
    assert.equal(isUpcomingShiftDate(null, "2026-10-09"), false);
  });

  it("match_date on-or-after uses calendar comparison", () => {
    assert.equal(isOnOrAfterCalendarDate("2026-10-09", "2026-10-09"), true);
    assert.equal(isOnOrAfterCalendarDate("10/9/2026", "2026-10-09"), true);
    assert.equal(isOnOrAfterCalendarDate("10/10/2026", "2026-10-09"), true);
    assert.equal(isOnOrAfterCalendarDate("10/8/2026", "2026-10-09"), false);
  });

  it("compareCalendarDates orders ISO and MDY the same way", () => {
    assert.equal(compareCalendarDates("9/28/2026", "2026-10-09", "mdy"), -1);
    assert.equal(compareCalendarDates("10/9/2026", "2026-10-09", "mdy"), 0);
    assert.equal(compareCalendarDates("10/10/2026", "2026-10-09", "mdy"), 1);
  });
});

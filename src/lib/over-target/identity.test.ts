import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOverTargetOccurrences,
  canonicalFieldsFromApp,
  findExistingOverTargetForAssignment,
  formatOverTargetWeekDate,
  isRetryableAppOverTargetRow,
  overTargetAppSourceKey,
  overTargetContentFingerprint,
  overTargetSheetSourceKey,
  parseOverTargetWeekDate,
  parseRequiredOverTargetCount,
  planOverTargetHistoricalImport,
  sheetWriteOutcome,
  shouldPreserveAppOverTargetRow,
  type OverTargetExistingRow,
  type OverTargetSheetSourceRow,
} from "./identity";

describe("parseRequiredOverTargetCount", () => {
  it("accepts integers 1 through 4", () => {
    assert.deepEqual(parseRequiredOverTargetCount(1), { ok: true, value: 1 });
    assert.deepEqual(parseRequiredOverTargetCount(2), { ok: true, value: 2 });
    assert.deepEqual(parseRequiredOverTargetCount(3), { ok: true, value: 3 });
    assert.deepEqual(parseRequiredOverTargetCount(4), { ok: true, value: 4 });
    assert.deepEqual(parseRequiredOverTargetCount("1"), { ok: true, value: 1 });
    assert.deepEqual(parseRequiredOverTargetCount("4"), { ok: true, value: 4 });
  });

  it("rejects 0, 5, -1, and null for new records", () => {
    assert.equal(parseRequiredOverTargetCount(0).ok, false);
    assert.equal(parseRequiredOverTargetCount(5).ok, false);
    assert.equal(parseRequiredOverTargetCount(-1).ok, false);
    assert.equal(parseRequiredOverTargetCount(null).ok, false);
    assert.equal(parseRequiredOverTargetCount(undefined).ok, false);
    assert.equal(parseRequiredOverTargetCount("").ok, false);
  });
});

describe("parseOverTargetWeekDate", () => {
  it("parses MDY dates without converting them to Sunday week-start", () => {
    assert.deepEqual(parseOverTargetWeekDate("8/16/2026"), { iso: "2026-08-16", raw: "8/16/2026" });
    assert.deepEqual(parseOverTargetWeekDate("9/6/2026"), { iso: "2026-09-06", raw: "9/6/2026" });
    assert.deepEqual(parseOverTargetWeekDate("8/18/2026"), { iso: "2026-08-18", raw: "8/18/2026" });
    assert.equal(formatOverTargetWeekDate("2026-08-16"), "8/16/2026");
    assert.equal(formatOverTargetWeekDate("2026-09-06"), "9/6/2026");
  });
});

describe("source_key fingerprint and occurrence", () => {
  it("builds SHA-256 fingerprints and occurrence ordinals for imported rows", () => {
    const row: OverTargetSheetSourceRow = {
      source_row_number: 2,
      match_id: "12345",
      week: "8/16/2026",
      hr_code: "a-100",
      team: "Team A",
      collector: "Jane",
      count: "2",
      done: "",
    };
    const duplicate: OverTargetSheetSourceRow = { ...row, source_row_number: 3 };
    const occurrences = buildOverTargetOccurrences([row, duplicate]);
    assert.equal(occurrences.length, 2);
    assert.equal(occurrences[0]?.occurrence_ordinal, 1);
    assert.equal(occurrences[1]?.occurrence_ordinal, 2);
    assert.equal(occurrences[0]?.content_fingerprint, occurrences[1]?.content_fingerprint);
    assert.match(occurrences[0]?.content_fingerprint ?? "", /^[a-f0-9]{64}$/);
    assert.equal(
      occurrences[0]?.source_key,
      overTargetSheetSourceKey(occurrences[0]!.content_fingerprint, 1)
    );
    assert.equal(
      occurrences[1]?.source_key,
      overTargetSheetSourceKey(occurrences[1]!.content_fingerprint, 2)
    );
    assert.notEqual(occurrences[0]?.source_key, occurrences[1]?.source_key);
  });

  it("uses app:assignment:{assignment_id} for app source keys", () => {
    assert.equal(overTargetAppSourceKey("asg-1"), "app:assignment:asg-1");
    const fields = canonicalFieldsFromApp({
      matchExternalId: "12345",
      weekRaw: "8/16/2026",
      hrCode: "A-100",
      team: "Team A",
      collector: "Jane",
      count: 2,
    });
    assert.equal(fields.done, "");
    assert.match(overTargetContentFingerprint(fields), /^[a-f0-9]{64}$/);
  });
});

describe("assignment idempotency", () => {
  it("never duplicates an existing assignment Over Target record", () => {
    const rows = [
      { assignment_id: "asg-1" },
      { assignment_id: null },
    ];
    assert.deepEqual(findExistingOverTargetForAssignment(rows, "asg-1"), { assignment_id: "asg-1" });
    assert.equal(findExistingOverTargetForAssignment(rows, "asg-2"), null);
  });
});

describe("sheet write outcomes", () => {
  it("marks success as synced and failure as failed without rolling back the assignment", () => {
    const now = "2026-08-16T00:00:00.000Z";
    assert.deepEqual(sheetWriteOutcome(true, 12, null, now), {
      sheet_sync_status: "synced",
      sheet_row_number: 12,
      sheet_synced_at: now,
      last_sheet_error: null,
    });
    assert.deepEqual(sheetWriteOutcome(false, null, "Google Sheets could not be written.", now), {
      sheet_sync_status: "failed",
      sheet_row_number: null,
      sheet_synced_at: null,
      last_sheet_error: "Google Sheets could not be written.",
    });
  });
});

describe("historical import", () => {
  it("imports unmatched sheet rows as google_sheet with assignment_id null unless the link is unambiguous", () => {
    const occurrences = buildOverTargetOccurrences([
      {
        source_row_number: 2,
        match_id: "111",
        week: "8/16/2026",
        hr_code: "A-1",
        team: "T",
        collector: "One",
        count: "1",
        done: "",
      },
      {
        source_row_number: 3,
        match_id: "222",
        week: "9/6/2026",
        hr_code: "A-2",
        team: "T",
        collector: "Two",
        count: "2",
        done: "",
      },
      {
        source_row_number: 4,
        match_id: "333",
        week: "9/6/2026",
        hr_code: "A-3",
        team: "T",
        collector: "Three",
        count: "",
        done: "",
      },
    ]);

    const existing: OverTargetExistingRow[] = [
      {
        id: "ot-app-pending",
        assignment_id: "asg-pending",
        source: "app",
        source_key: "app:assignment:asg-pending",
        sheet_sync_status: "pending",
        source_present: true,
      },
      {
        id: "ot-app-failed",
        assignment_id: "asg-failed",
        source: "app",
        source_key: "app:assignment:asg-failed",
        sheet_sync_status: "failed",
        source_present: true,
      },
    ];

    const plan = planOverTargetHistoricalImport(occurrences, existing, [
      { assignment_id: "asg-1", match_id: "m-1", match_external_id: "111", hr_code: "A-1" },
      { assignment_id: "asg-2a", match_id: "m-2", match_external_id: "222", hr_code: "A-2" },
      { assignment_id: "asg-2b", match_id: "m-2", match_external_id: "222", hr_code: "A-2" },
      { assignment_id: "asg-pending", match_id: "m-p", match_external_id: "999", hr_code: "A-9" },
      { assignment_id: "asg-failed", match_id: "m-f", match_external_id: "998", hr_code: "A-8" },
    ]);

    assert.equal(plan.inserts.length, 3);
    assert.equal(plan.inserts[0]?.assignment_id, "asg-1");
    assert.equal(plan.inserts[1]?.assignment_id, null);
    assert.equal(plan.inserts[2]?.assignment_id, null);
    assert.deepEqual(plan.preservedAppIds.sort(), ["ot-app-failed", "ot-app-pending"]);
    assert.deepEqual(plan.missingIds, []);
    assert.equal(shouldPreserveAppOverTargetRow(existing[0]!), true);
    assert.equal(isRetryableAppOverTargetRow(existing[0]!), true);
    assert.equal(isRetryableAppOverTargetRow(existing[1]!), true);
  });
});

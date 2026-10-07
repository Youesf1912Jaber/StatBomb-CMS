import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OverTargetRow } from "../../types/database.types";
import {
  displayOverTargetCount,
  displayOverTargetDone,
  displayOverTargetSyncStatus,
  displayOverTargetWeek,
  filterOverTargetRecords,
} from "./view";

function makeRecord(overrides: Partial<OverTargetRow> = {}): OverTargetRow {
  return {
    id: "ot-1",
    assignment_id: "asg-1",
    match_id: "match-1",
    match_external_id: "12345",
    week_date: "2026-10-05",
    week_date_raw: "10/5/2026",
    hr_code: "A-100",
    collector_id: "col-1",
    collector_name: "Jane",
    team: "Team A",
    count_value: 2,
    count_raw: "2",
    done: null,
    done_raw: null,
    source: "app",
    source_key: "app:assignment:asg-1",
    content_fingerprint: "fp",
    occurrence_ordinal: 1,
    sheet_row_number: 12,
    sheet_tab: "Over Target",
    sheet_gid: 1650824123,
    sheet_sync_status: "synced",
    sheet_synced_at: "2026-10-05T00:00:00.000Z",
    last_sheet_error: null,
    source_present: true,
    last_seen_at: "2026-10-05T00:00:00.000Z",
    first_synced_at: "2026-10-05T00:00:00.000Z",
    last_synced_at: "2026-10-05T00:00:00.000Z",
    created_by: "admin-1",
    created_at: "2026-10-05T00:00:00.000Z",
    updated_at: "2026-10-05T00:00:00.000Z",
    ...overrides,
  };
}

describe("displayOverTargetWeek", () => {
  it("prefers the raw week and formats ISO dates as M/D/YYYY", () => {
    assert.equal(displayOverTargetWeek(makeRecord()), "10/5/2026");
    assert.equal(displayOverTargetWeek(makeRecord({ week_date_raw: null })), "10/5/2026");
    assert.equal(displayOverTargetWeek(makeRecord({ week_date: null, week_date_raw: null })), "—");
  });
});

describe("displayOverTargetCount and Done", () => {
  it("shows count, blank Done, and Yes/No when Done is set", () => {
    assert.equal(displayOverTargetCount(makeRecord()), "2");
    assert.equal(displayOverTargetCount(makeRecord({ count_value: null, count_raw: null })), "—");
    assert.equal(displayOverTargetDone(makeRecord()), "—");
    assert.equal(displayOverTargetDone(makeRecord({ done: true })), "Yes");
    assert.equal(displayOverTargetDone(makeRecord({ done: false })), "No");
  });
});

describe("displayOverTargetSyncStatus", () => {
  it("labels cache sync statuses for the viewing pages", () => {
    assert.equal(displayOverTargetSyncStatus("synced"), "Synced");
    assert.equal(displayOverTargetSyncStatus("pending"), "Pending");
    assert.equal(displayOverTargetSyncStatus("failed"), "Failed");
    assert.equal(displayOverTargetSyncStatus("imported"), "Imported");
  });
});

describe("filterOverTargetRecords", () => {
  it("filters by search text and optional sync status without changing source records", () => {
    const records = [
      makeRecord(),
      makeRecord({
        id: "ot-2",
        match_external_id: "99999",
        hr_code: "B-200",
        collector_name: "Omar",
        team: "Team B",
        sheet_sync_status: "failed",
      }),
    ];
    assert.equal(filterOverTargetRecords(records, "jane").length, 1);
    assert.equal(filterOverTargetRecords(records, "99999")[0]?.hr_code, "B-200");
    assert.equal(filterOverTargetRecords(records, "", "failed").length, 1);
    assert.equal(filterOverTargetRecords(records, "jane", "failed").length, 0);
    assert.equal(records.length, 2);
  });
});

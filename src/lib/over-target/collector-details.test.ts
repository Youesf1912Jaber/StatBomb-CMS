import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { OverTargetRow } from "../../types/database.types";
import {
  collectorOverTargetAssignmentHref,
  mergeCollectorOverTargetMatchDetails,
  mergeCollectorOverTargetRecords,
  type CollectorOverTargetAssignmentDetails,
  type CollectorOverTargetMatchDetails,
} from "./collector-details";

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

const assignment: CollectorOverTargetAssignmentDetails = {
  id: "asg-1",
  match_id: "match-1",
  sla: "2026-10-05T19:35:00.000Z",
  status: "In Progress",
};

const match: CollectorOverTargetMatchDetails = {
  id: "match-1",
  home_team: "Arsenal",
  away_team: "Chelsea",
};

describe("collectorOverTargetAssignmentHref", () => {
  it("links Match ID to the existing Collector Assignment page", () => {
    assert.equal(collectorOverTargetAssignmentHref("asg-1"), "/collector/assignments/asg-1");
  });

  it("returns no link when assignment_id is missing", () => {
    assert.equal(collectorOverTargetAssignmentHref(null), null);
    assert.equal(collectorOverTargetAssignmentHref(undefined), null);
    assert.equal(collectorOverTargetAssignmentHref(""), null);
    assert.equal(collectorOverTargetAssignmentHref("   "), null);
  });
});

describe("mergeCollectorOverTargetMatchDetails", () => {
  it("displays Home Team, Away Team, and SLA from existing match/assignment data", () => {
    const merged = mergeCollectorOverTargetMatchDetails(
      makeRecord(),
      new Map([[assignment.id, assignment]]),
      new Map([[match.id, match]])
    );
    assert.equal(merged.home_team, "Arsenal");
    assert.equal(merged.away_team, "Chelsea");
    assert.equal(merged.sla, "2026-10-05T19:35:00.000Z");
    assert.equal(merged.assignment_status, "In Progress");
    assert.equal(merged.assignment_href, "/collector/assignments/asg-1");
    assert.equal(merged.match_external_id, "12345");
  });

  it("does not crash when assignment_id is missing and still resolves match data from match_id", () => {
    const merged = mergeCollectorOverTargetMatchDetails(
      makeRecord({ assignment_id: null, match_id: "match-1" }),
      new Map(),
      new Map([[match.id, match]])
    );
    assert.equal(merged.assignment_id, null);
    assert.equal(merged.assignment_href, null);
    assert.equal(merged.home_team, "Arsenal");
    assert.equal(merged.away_team, "Chelsea");
    assert.equal(merged.sla, null);
    assert.equal(merged.assignment_status, null);
  });

  it("does not crash when linked assignment and match cannot be resolved", () => {
    const merged = mergeCollectorOverTargetMatchDetails(
      makeRecord({ assignment_id: null, match_id: null }),
      new Map(),
      new Map()
    );
    assert.equal(merged.home_team, null);
    assert.equal(merged.away_team, null);
    assert.equal(merged.sla, null);
    assert.equal(merged.assignment_href, null);
  });

  it("does not link Match ID when assignment_id is present but the assignment cannot be resolved", () => {
    const merged = mergeCollectorOverTargetMatchDetails(
      makeRecord({ assignment_id: "asg-missing", match_id: "match-1" }),
      new Map(),
      new Map([[match.id, match]])
    );
    assert.equal(merged.assignment_href, null);
    assert.equal(merged.home_team, "Arsenal");
    assert.equal(merged.away_team, "Chelsea");
    assert.equal(merged.sla, null);
  });

  it("does not duplicate match fields onto the Over Target source row", () => {
    const source = makeRecord();
    mergeCollectorOverTargetMatchDetails(
      source,
      new Map([[assignment.id, assignment]]),
      new Map([[match.id, match]])
    );
    assert.equal("home_team" in source, false);
    assert.equal("away_team" in source, false);
    assert.equal("sla" in source, false);
  });
});

describe("mergeCollectorOverTargetRecords", () => {
  it("keeps Over Target records and attaches match details per row", () => {
    const historical = makeRecord({
      id: "ot-2",
      assignment_id: null,
      match_id: "match-1",
      match_external_id: "99999",
    });
    const merged = mergeCollectorOverTargetRecords(
      [makeRecord(), historical],
      new Map([[assignment.id, assignment]]),
      new Map([[match.id, match]])
    );
    assert.equal(merged.length, 2);
    assert.equal(merged[0]?.home_team, "Arsenal");
    assert.equal(merged[0]?.away_team, "Chelsea");
    assert.equal(merged[0]?.sla, "2026-10-05T19:35:00.000Z");
    assert.equal(merged[0]?.assignment_href, "/collector/assignments/asg-1");
    assert.equal(merged[1]?.home_team, "Arsenal");
    assert.equal(merged[1]?.away_team, "Chelsea");
    assert.equal(merged[1]?.sla, null);
    assert.equal(merged[1]?.assignment_href, null);
  });
});

describe("Collector Over Target page wiring", () => {
  const dir = fileURLToPath(new URL(".", import.meta.url));

  it("collector API enriches records from assignments and matches, not over_target columns", () => {
    const source = readFileSync(join(dir, "../../app/api/collector/over-target/route.ts"), "utf8");
    assert.match(source, /getCollectorOverTargetRecords/);
    assert.equal(source.includes("getOverTargetRecordsForHrCode"), false);
  });

  it("collector query looks up Home Team, Away Team, and SLA from existing tables", () => {
    const source = readFileSync(join(dir, "queries.ts"), "utf8");
    assert.match(source, /from\("assignments"\)/);
    assert.match(source, /select\("id, match_id, sla, status"\)/);
    assert.match(source, /from\("matches"\)/);
    assert.match(source, /select\("id, home_team, away_team"\)/);
    assert.match(source, /mergeCollectorOverTargetRecords/);
  });

  it("collector table shows Home Team, Away Team, SLA and links Match ID to the assignment page", () => {
    const source = readFileSync(join(dir, "../../components/OverTargetTable.tsx"), "utf8");
    assert.match(source, /Home Team/);
    assert.match(source, /Away Team/);
    assert.match(source, />SLA</);
    assert.match(source, /details\.assignment_href/);
    assert.match(source, /SlaCountdown/);
    assert.match(source, /<Link href=\{matchIdHref\}/);
    assert.match(source, /details\.home_team/);
    assert.match(source, /details\.away_team/);
    assert.match(source, /isAdmin \? details\.match_href : details\.assignment_href/);
  });

  it("keeps Collector Over Target client on the collector assignment route", () => {
    const source = readFileSync(join(dir, "../../app/collector/over-target/OverTargetClient.tsx"), "utf8");
    assert.match(source, /variant="collector"/);
    assert.match(source, /CollectorOverTargetRecord/);
    assert.equal(source.includes("AdminOverTargetRecord"), false);
    assert.equal(source.includes("/admin/matches/"), false);
  });
});

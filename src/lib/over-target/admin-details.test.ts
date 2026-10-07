import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { OverTargetRow } from "../../types/database.types";
import {
  adminOverTargetAssignmentHref,
  mergeAdminOverTargetMatchDetails,
  mergeAdminOverTargetRecords,
  uniqueAdminAssignmentByCollectorMatch,
  type AdminOverTargetAssignmentDetails,
  type AdminOverTargetMatchDetails,
} from "./admin-details";

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

const assignment: AdminOverTargetAssignmentDetails = {
  id: "asg-1",
  match_id: "match-1",
  collector_id: "col-1",
  sla: "2026-10-05T19:35:00.000Z",
  status: "In Progress",
};

const match: AdminOverTargetMatchDetails = {
  id: "match-1",
  external_id: "12345",
  home_team: "Arsenal",
  away_team: "Chelsea",
};

describe("adminOverTargetAssignmentHref", () => {
  it("links Match ID to the existing Admin Assignment Detail page", () => {
    assert.equal(adminOverTargetAssignmentHref("asg-1"), "/admin/assignments/asg-1");
    assert.equal(
      adminOverTargetAssignmentHref("72006803-2257-43ef-822c-e5c13df6910d"),
      "/admin/assignments/72006803-2257-43ef-822c-e5c13df6910d"
    );
  });

  it("returns no link when assignment_id is missing", () => {
    assert.equal(adminOverTargetAssignmentHref(null), null);
    assert.equal(adminOverTargetAssignmentHref(undefined), null);
    assert.equal(adminOverTargetAssignmentHref(""), null);
    assert.equal(adminOverTargetAssignmentHref("   "), null);
  });
});

describe("mergeAdminOverTargetMatchDetails", () => {
  it("displays Home Team, Away Team, and SLA from existing match/assignment data", () => {
    const merged = mergeAdminOverTargetMatchDetails(
      makeRecord(),
      new Map([[assignment.id, assignment]]),
      new Map([[match.id, match]])
    );
    assert.equal(merged.home_team, "Arsenal");
    assert.equal(merged.away_team, "Chelsea");
    assert.equal(merged.sla, "2026-10-05T19:35:00.000Z");
    assert.equal(merged.assignment_status, "In Progress");
    assert.equal(merged.match_href, "/admin/assignments/asg-1");
    assert.equal(merged.match_href?.includes("/admin/matches/"), false);
    assert.equal(merged.match_href?.includes("/distribution"), false);
    assert.equal(merged.match_external_id, "12345");
  });

  it("links an Over Target row with assignment_id to /admin/assignments/{assignment_id}", () => {
    const merged = mergeAdminOverTargetMatchDetails(
      makeRecord({ assignment_id: "72006803-2257-43ef-822c-e5c13df6910d" }),
      new Map([
        [
          "72006803-2257-43ef-822c-e5c13df6910d",
          { ...assignment, id: "72006803-2257-43ef-822c-e5c13df6910d" },
        ],
      ]),
      new Map([[match.id, match]])
    );
    assert.equal(merged.match_href, "/admin/assignments/72006803-2257-43ef-822c-e5c13df6910d");
    assert.notEqual(merged.match_href, "/admin/matches/12345/distribution");
  });

  it("does not crash when assignment_id is missing and still resolves teams without linking to distribution", () => {
    const merged = mergeAdminOverTargetMatchDetails(
      makeRecord({ assignment_id: null, match_id: null }),
      new Map(),
      new Map(),
      new Map([[match.external_id, match]])
    );
    assert.equal(merged.assignment_id, null);
    assert.equal(merged.home_team, "Arsenal");
    assert.equal(merged.away_team, "Chelsea");
    assert.equal(merged.sla, null);
    assert.equal(merged.match_href, null);
    assert.equal(merged.match_external_id, "12345");
  });

  it("does not crash when assignment_id is missing and match_id still resolves teams", () => {
    const merged = mergeAdminOverTargetMatchDetails(
      makeRecord({ assignment_id: null, match_id: "match-1" }),
      new Map(),
      new Map([[match.id, match]])
    );
    assert.equal(merged.assignment_id, null);
    assert.equal(merged.home_team, "Arsenal");
    assert.equal(merged.away_team, "Chelsea");
    assert.equal(merged.sla, null);
    assert.equal(merged.match_href, null);
  });

  it("links a missing assignment_id only when collector + match resolve to one assignment", () => {
    const fallback = uniqueAdminAssignmentByCollectorMatch([assignment]);
    const merged = mergeAdminOverTargetMatchDetails(
      makeRecord({ assignment_id: null, match_id: "match-1", collector_id: "col-1" }),
      new Map(),
      new Map([[match.id, match]]),
      new Map(),
      fallback
    );
    assert.equal(merged.assignment_id, null);
    assert.equal(merged.match_href, "/admin/assignments/asg-1");
    assert.equal(merged.sla, "2026-10-05T19:35:00.000Z");
  });

  it("keeps Match ID non-clickable when missing assignment_id is ambiguous across collectors", () => {
    const other: AdminOverTargetAssignmentDetails = {
      id: "asg-2",
      match_id: "match-1",
      collector_id: "col-2",
      sla: "2026-10-05T20:00:00.000Z",
      status: "Not Started",
    };
    const merged = mergeAdminOverTargetMatchDetails(
      makeRecord({ assignment_id: null, match_id: "match-1", collector_id: null }),
      new Map([
        [assignment.id, assignment],
        [other.id, other],
      ]),
      new Map([[match.id, match]]),
      new Map(),
      uniqueAdminAssignmentByCollectorMatch([assignment, other])
    );
    assert.equal(merged.match_external_id, "12345");
    assert.equal(merged.match_href, null);
  });

  it("leaves Match ID non-clickable when the match cannot be resolved", () => {
    const merged = mergeAdminOverTargetMatchDetails(
      makeRecord({ assignment_id: null, match_id: null, match_external_id: "99999" }),
      new Map(),
      new Map(),
      new Map()
    );
    assert.equal(merged.match_external_id, "99999");
    assert.equal(merged.home_team, null);
    assert.equal(merged.away_team, null);
    assert.equal(merged.sla, null);
    assert.equal(merged.match_href, null);
  });

  it("does not duplicate match fields onto the Over Target source row", () => {
    const source = makeRecord();
    mergeAdminOverTargetMatchDetails(
      source,
      new Map([[assignment.id, assignment]]),
      new Map([[match.id, match]])
    );
    assert.equal("home_team" in source, false);
    assert.equal("away_team" in source, false);
    assert.equal("sla" in source, false);
    assert.equal("match_href" in source, false);
  });
});

describe("mergeAdminOverTargetRecords", () => {
  it("keeps all collector Over Target records and attaches match details per row", () => {
    const historical = makeRecord({
      id: "ot-2",
      assignment_id: null,
      match_id: null,
      match_external_id: "99999",
    });
    const merged = mergeAdminOverTargetRecords(
      [makeRecord(), historical],
      new Map([[assignment.id, assignment]]),
      new Map([[match.id, match]]),
      new Map()
    );
    assert.equal(merged.length, 2);
    assert.equal(merged[0]?.home_team, "Arsenal");
    assert.equal(merged[0]?.away_team, "Chelsea");
    assert.equal(merged[0]?.sla, "2026-10-05T19:35:00.000Z");
    assert.equal(merged[0]?.match_href, "/admin/assignments/asg-1");
    assert.equal(merged[1]?.match_external_id, "99999");
    assert.equal(merged[1]?.match_href, null);
    assert.equal(merged[1]?.sla, null);
  });

  it("two assignments on the same match resolve to their respective assignment URLs", () => {
    const collectorA: AdminOverTargetAssignmentDetails = {
      id: "asg-a",
      match_id: "match-1",
      collector_id: "col-a",
      sla: "2026-10-05T19:35:00.000Z",
      status: "In Progress",
    };
    const collectorB: AdminOverTargetAssignmentDetails = {
      id: "asg-b",
      match_id: "match-1",
      collector_id: "col-b",
      sla: "2026-10-05T20:00:00.000Z",
      status: "Not Started",
    };
    const merged = mergeAdminOverTargetRecords(
      [
        makeRecord({
          id: "ot-a",
          assignment_id: "asg-a",
          collector_id: "col-a",
          collector_name: "Collector A",
          hr_code: "A-1",
        }),
        makeRecord({
          id: "ot-b",
          assignment_id: "asg-b",
          collector_id: "col-b",
          collector_name: "Collector B",
          hr_code: "A-2",
        }),
      ],
      new Map([
        [collectorA.id, collectorA],
        [collectorB.id, collectorB],
      ]),
      new Map([[match.id, match]])
    );
    assert.equal(merged[0]?.match_href, "/admin/assignments/asg-a");
    assert.equal(merged[1]?.match_href, "/admin/assignments/asg-b");
    assert.notEqual(merged[0]?.match_href, merged[1]?.match_href);
    assert.equal(merged[0]?.match_href?.includes("/admin/matches/"), false);
    assert.equal(merged[1]?.match_href?.includes("/distribution"), false);
  });
});

describe("Admin Over Target page wiring", () => {
  const dir = fileURLToPath(new URL(".", import.meta.url));

  it("admin API enriches records from assignments and matches, not over_target columns", () => {
    const source = readFileSync(join(dir, "../../app/api/admin/over-target/route.ts"), "utf8");
    assert.match(source, /getAdminOverTargetRecords/);
    assert.equal(source.includes("getAllOverTargetRecords"), false);
  });

  it("admin query looks up Home Team, Away Team, and SLA from existing tables", () => {
    const source = readFileSync(join(dir, "queries.ts"), "utf8");
    assert.match(source, /export async function getAdminOverTargetRecords/);
    assert.match(source, /from\("assignments"\)/);
    assert.match(source, /select\("id, match_id, collector_id, sla, status"\)/);
    assert.match(source, /select\("id, external_id, home_team, away_team"\)/);
    assert.match(source, /mergeAdminOverTargetRecords/);
  });

  it("admin table shows Home Team, Away Team, SLA and links Match ID via match_href", () => {
    const source = readFileSync(join(dir, "../../components/OverTargetTable.tsx"), "utf8");
    assert.match(source, /Home Team/);
    assert.match(source, /Away Team/);
    assert.match(source, />SLA</);
    assert.match(source, /details\.match_href/);
    assert.match(source, /SlaCountdown/);
    assert.match(source, /HR-Code/);
    assert.match(source, /Collector/);
    assert.equal(source.includes("/admin/matches/"), false);
  });

  it("admin Over Target client uses admin-enriched records", () => {
    const source = readFileSync(join(dir, "../../app/admin/over-target/OverTargetClient.tsx"), "utf8");
    assert.match(source, /variant="admin"/);
    assert.match(source, /AdminOverTargetRecord/);
    assert.equal(source.includes("/collector/assignments/"), false);
  });

  it("admin assignment href never points at match distribution", () => {
    const source = readFileSync(join(dir, "admin-details.ts"), "utf8");
    assert.match(source, /\/admin\/assignments\/\$\{encodeURIComponent\(trimmed\)\}/);
    assert.equal(source.includes("/admin/matches/"), false);
    assert.equal(source.includes("/distribution"), false);
  });

  it("does not change Collector Over Target assignment routing", () => {
    const collectorClient = readFileSync(join(dir, "../../app/collector/over-target/OverTargetClient.tsx"), "utf8");
    const collectorDetails = readFileSync(join(dir, "collector-details.ts"), "utf8");
    assert.match(collectorClient, /variant="collector"/);
    assert.match(collectorDetails, /\/collector\/assignments\/\$\{trimmed\}/);
  });
});

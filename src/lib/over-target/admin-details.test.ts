import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { OverTargetRow } from "../../types/database.types";
import {
  adminOverTargetMatchHref,
  mergeAdminOverTargetMatchDetails,
  mergeAdminOverTargetRecords,
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
  sla: "2026-10-05T19:35:00.000Z",
  status: "In Progress",
};

const match: AdminOverTargetMatchDetails = {
  id: "match-1",
  external_id: "12345",
  home_team: "Arsenal",
  away_team: "Chelsea",
};

describe("adminOverTargetMatchHref", () => {
  it("links Match ID to the existing Admin Match Distribution page", () => {
    assert.equal(adminOverTargetMatchHref("12345"), "/admin/matches/12345/distribution");
  });

  it("returns no link when the match external id is missing", () => {
    assert.equal(adminOverTargetMatchHref(null), null);
    assert.equal(adminOverTargetMatchHref(undefined), null);
    assert.equal(adminOverTargetMatchHref(""), null);
    assert.equal(adminOverTargetMatchHref("   "), null);
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
    assert.equal(merged.match_href, "/admin/matches/12345/distribution");
    assert.equal(merged.match_external_id, "12345");
  });

  it("does not crash when assignment_id is missing and still links a resolved Match Master record", () => {
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
    assert.equal(merged.match_href, "/admin/matches/12345/distribution");
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
    assert.equal(merged.match_href, "/admin/matches/12345/distribution");
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
    assert.equal(merged[0]?.match_href, "/admin/matches/12345/distribution");
    assert.equal(merged[1]?.match_external_id, "99999");
    assert.equal(merged[1]?.match_href, null);
    assert.equal(merged[1]?.sla, null);
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
    assert.match(source, /select\("id, match_id, sla, status"\)/);
    assert.match(source, /select\("id, external_id, home_team, away_team"\)/);
    assert.match(source, /mergeAdminOverTargetRecords/);
  });

  it("admin table shows Home Team, Away Team, SLA and links Match ID to the existing match page", () => {
    const source = readFileSync(join(dir, "../../components/OverTargetTable.tsx"), "utf8");
    assert.match(source, /Home Team/);
    assert.match(source, /Away Team/);
    assert.match(source, />SLA</);
    assert.match(source, /details\.match_href/);
    assert.match(source, /SlaCountdown/);
    assert.match(source, /HR-Code/);
    assert.match(source, /Collector/);
  });

  it("admin Over Target client uses admin-enriched records", () => {
    const source = readFileSync(join(dir, "../../app/admin/over-target/OverTargetClient.tsx"), "utf8");
    assert.match(source, /variant="admin"/);
    assert.match(source, /AdminOverTargetRecord/);
    assert.equal(source.includes("/collector/assignments/"), false);
  });

  it("does not change Collector Over Target assignment routing", () => {
    const collectorClient = readFileSync(join(dir, "../../app/collector/over-target/OverTargetClient.tsx"), "utf8");
    const collectorDetails = readFileSync(join(dir, "collector-details.ts"), "utf8");
    assert.match(collectorClient, /variant="collector"/);
    assert.match(collectorDetails, /\/collector\/assignments\/\$\{trimmed\}/);
  });
});

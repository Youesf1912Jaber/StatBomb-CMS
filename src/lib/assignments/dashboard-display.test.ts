import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { AssignmentWithMatch } from "./types";
import { displayAssignmentMatchId, displayAssignmentShiftDate } from "./dashboard-display";

const dir = fileURLToPath(new URL(".", import.meta.url));

function makeAssignment(
  overrides: Partial<Omit<AssignmentWithMatch, "match">> & {
    match?: Partial<AssignmentWithMatch["match"]>;
  } = {},
): AssignmentWithMatch {
  const { match, ...assignment } = overrides;
  return {
    id: "11111111-1111-4111-8111-111111111111",
    match_id: "22222222-2222-4222-8222-222222222222",
    collector_id: "33333333-3333-4333-8333-333333333333",
    previous_collector_id: null,
    raw_task_value: "Live Data",
    task: "Live Data",
    half: "Half 1",
    sla: "2026-10-09T18:00:00.000Z",
    shift_date: "2026-10-10",
    status: "In Progress",
    started_at: "2026-10-09T12:00:00.000Z",
    completed_at: null,
    sla_warning_sent_at: null,
    overdue_notified_at: null,
    notes: null,
    distribution_present: true,
    hidden_from_admin_dashboard: false,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    ...assignment,
    match: {
      id: "22222222-2222-4222-8222-222222222222",
      external_id: "1457528",
      home_team: "Home FC",
      away_team: "Away FC",
      competition: "League",
      match_date: "2026-10-09",
      kickoff_time: "2026-10-09T17:00:00.000Z",
      official_website_url: null,
      created_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-10-01T00:00:00.000Z",
      ...match,
    },
  };
}

describe("displayAssignmentMatchId", () => {
  it("displays the external Match ID, not the database UUID", () => {
    const assignment = makeAssignment();
    assert.equal(displayAssignmentMatchId(assignment), "1457528");
    assert.notEqual(displayAssignmentMatchId(assignment), assignment.match.id);
    assert.notEqual(displayAssignmentMatchId(assignment), assignment.match_id);
    assert.notEqual(displayAssignmentMatchId(assignment), assignment.id);
  });

  it("handles missing or blank external IDs without throwing", () => {
    assert.equal(displayAssignmentMatchId(makeAssignment({ match: { external_id: "" } })), "—");
    assert.equal(displayAssignmentMatchId(makeAssignment({ match: { external_id: "   " } })), "—");
  });
});

describe("displayAssignmentShiftDate", () => {
  it("displays the assignment Shift Date, not Match Date", () => {
    const assignment = makeAssignment({
      shift_date: "2026-10-10",
      match: { match_date: "2026-10-09" },
    });
    assert.equal(displayAssignmentShiftDate(assignment), "2026-10-10");
    assert.notEqual(displayAssignmentShiftDate(assignment), assignment.match.match_date);
  });

  it("stays correct when Shift Date differs from Match Date", () => {
    const assignment = makeAssignment({
      shift_date: "2026-09-28",
      match: { match_date: "2026-10-09" },
    });
    assert.equal(displayAssignmentShiftDate(assignment), "2026-09-28");
    assert.notEqual(displayAssignmentShiftDate(assignment), "2026-10-09");
  });

  it("parses Distribution DMY Shift Date without timezone shift", () => {
    assert.equal(displayAssignmentShiftDate(makeAssignment({ shift_date: "29/9/2026" })), "2026-09-29");
    assert.equal(displayAssignmentShiftDate(makeAssignment({ shift_date: "30/9/2026" })), "2026-09-30");
    assert.equal(displayAssignmentShiftDate(makeAssignment({ shift_date: "9/10/2026" })), "2026-10-09");
  });

  it("handles missing or invalid Shift Date without throwing", () => {
    assert.equal(displayAssignmentShiftDate(makeAssignment({ shift_date: null })), "—");
    assert.equal(displayAssignmentShiftDate(makeAssignment({ shift_date: "" })), "—");
    assert.equal(displayAssignmentShiftDate(makeAssignment({ shift_date: "not a date" })), "—");
    assert.equal(displayAssignmentShiftDate(makeAssignment({ shift_date: "2/30/2026" })), "—");
  });
});

describe("Admin Dashboard assignment table columns", () => {
  const table = readFileSync(join(dir, "../../components/AssignmentTable.tsx"), "utf8");
  const page = readFileSync(join(dir, "../../app/admin/page.tsx"), "utf8");
  const queries = readFileSync(join(dir, "queries.ts"), "utf8");

  it("adds Match ID and Shift Date columns to AssignmentTable", () => {
    assert.match(table, /displayAssignmentMatchId/);
    assert.match(table, /displayAssignmentShiftDate/);
    assert.match(table, />Match ID</);
    assert.match(table, />Shift Date</);
    assert.match(table, />Match Date</);
    assert.match(table, /whitespace-nowrap/);
    assert.match(table, /font-mono/);
  });

  it("renders external match ID, not assignment.match_id or match.id UUID", () => {
    assert.match(table, /displayAssignmentMatchId\(a\)/);
    assert.equal(table.includes("{a.match_id}"), false);
    assert.equal(table.includes("{a.match.id}"), false);
    assert.equal(table.includes("{a.match.external_id}"), false);
  });

  it("renders assignment.shift_date, not match.match_date, for Shift Date", () => {
    assert.match(table, /displayAssignmentShiftDate\(a\)/);
    const shiftDateCell = table.slice(
      table.indexOf(">Shift Date</"),
      table.indexOf("{displayAssignmentShiftDate(a)}"),
    );
    assert.ok(shiftDateCell.length >= 0);
    assert.equal(table.includes("displayAssignmentShiftDate(a.match.match_date)"), false);
    assert.match(table, /\{a\.match\.match_date\}/);
  });

  it("does not parse Shift Date with new Date()", () => {
    assert.equal(/displayAssignmentShiftDate[\s\S]*new Date\(a\.shift_date\)/.test(table), false);
    assert.equal(/new Date\(a\.shift_date\)/.test(table), false);
  });

  it("keeps Current Shift, In Progress, Completed, and All Distributed tables on AssignmentTable", () => {
    assert.match(page, /Current Shift/);
    assert.match(page, /CURRENT_SHIFT_STATUS_ORDER/);
    assert.match(page, /"Completed"/);
    assert.match(page, /"In Progress"/);
    assert.match(page, /All Distributed Matches/);
    assert.match(page, /<AssignmentTable/);
    assert.match(page, /showCollector/);
    assert.match(page, /AdminBulkCompleteButton/);
    assert.match(page, /isCurrentShiftDate\(assignment\.shift_date, currentShiftDate\)/);
  });

  it("reuses dashboard assignment query data without extra per-row fetches", () => {
    assert.match(queries, /export async function getAdminDashboardAssignments/);
    assert.match(queries, /attachMatches/);
    assert.match(page, /getAdminDashboardAssignments\(supabase\)/);
    assert.equal(page.includes("from(\"matches\")"), false);
  });

  it("preserves admin actions, filters, status, and existing columns", () => {
    assert.match(table, /AdminAssignmentActions/);
    assert.match(table, /assignmentId=\{a\.id\}/);
    assert.match(table, /status=\{a\.status\}/);
    assert.match(table, /STATUS_OPTIONS/);
    assert.match(table, /SlaCountdown/);
    assert.match(table, /distributionPresenceLabel/);
    assert.match(table, />Kick-off</);
    assert.match(table, />Task</);
    assert.match(table, />Half</);
    assert.match(table, />Status</);
  });
});

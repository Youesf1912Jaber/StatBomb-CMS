import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { OverTargetRow } from "../../types/database.types";
import { formatAddAssignmentFeedback } from "./add-assignment-feedback";
import {
  attachOverTargetsToAssignments,
  parseDistributionOverTargetFields,
  resolveOverTargetDistributionWeek,
  type OverTargetCreateInput,
  type OverTargetCreateResult,
} from "./assignment-integration";

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

describe("normal assignment", () => {
  it("leaves overTarget false and count null when the flag is omitted or false", () => {
    assert.deepEqual(parseDistributionOverTargetFields({}), { ok: true, value: { overTarget: false, overTargetCount: null } });
    assert.deepEqual(parseDistributionOverTargetFields({ overTarget: false, overTargetCount: 3 }), {
      ok: true,
      value: { overTarget: false, overTargetCount: null },
    });
    assert.deepEqual(parseDistributionOverTargetFields({ overTarget: "true", overTargetCount: 2 }), {
      ok: true,
      value: { overTarget: false, overTargetCount: null },
    });
  });

  it("does not call create when overTarget is false", async () => {
    const calls: OverTargetCreateInput[] = [];
    const result = await attachOverTargetsToAssignments(
      [{ assignmentId: "asg-1", overTarget: false, overTargetCount: 2 }],
      {
        weekDate: "10/5/2026",
        createdBy: "admin-1",
        create: async (input) => {
          calls.push(input);
          return { ok: true, record: makeRecord() };
        },
      }
    );
    assert.equal(calls.length, 0);
    assert.deepEqual(result.records, []);
    assert.deepEqual(result.warnings, []);
    assert.equal(result.sheetFailed, false);
  });
});

describe("Count validation 1-4", () => {
  it("requires Count 1-4 when overTarget is true", () => {
    assert.equal(parseDistributionOverTargetFields({ overTarget: true }).ok, false);
    assert.equal(parseDistributionOverTargetFields({ overTarget: true, overTargetCount: null }).ok, false);
    assert.equal(parseDistributionOverTargetFields({ overTarget: true, overTargetCount: 0 }).ok, false);
    assert.equal(parseDistributionOverTargetFields({ overTarget: true, overTargetCount: 5 }).ok, false);
    assert.equal(parseDistributionOverTargetFields({ overTarget: true, overTargetCount: -1 }).ok, false);
    assert.equal(parseDistributionOverTargetFields({ overTarget: true, overTargetCount: 1.5 }).ok, false);
    for (const count of [1, 2, 3, 4]) {
      assert.deepEqual(parseDistributionOverTargetFields({ overTarget: true, overTargetCount: count }), {
        ok: true,
        value: { overTarget: true, overTargetCount: count },
      });
    }
  });
});

describe("successful OT creation", () => {
  it("creates exactly one linked Over Target record with Week as the distribution date and Done blank", async () => {
    const week = resolveOverTargetDistributionWeek(new Date("2026-10-05T12:00:00+03:00"));
    assert.equal(week, "10/5/2026");

    const calls: OverTargetCreateInput[] = [];
    const result = await attachOverTargetsToAssignments(
      [
        { assignmentId: "asg-normal", overTarget: false, overTargetCount: null },
        { assignmentId: "asg-ot", overTarget: true, overTargetCount: 3 },
      ],
      {
        weekDate: week,
        createdBy: "admin-1",
        create: async (input) => {
          calls.push(input);
          return {
            ok: true,
            record: makeRecord({
              id: "ot-ot",
              assignment_id: String(input.assignmentId),
              count_value: Number(input.count),
              count_raw: String(input.count),
              week_date_raw: String(input.weekDate),
              done: null,
              done_raw: null,
              sheet_sync_status: "synced",
            }),
          };
        },
      }
    );

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      assignmentId: "asg-ot",
      weekDate: "10/5/2026",
      count: 3,
      createdBy: "admin-1",
    });
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0]?.assignment_id, "asg-ot");
    assert.equal(result.records[0]?.count_value, 3);
    assert.equal(result.records[0]?.week_date_raw, "10/5/2026");
    assert.equal(result.records[0]?.done, null);
    assert.equal(result.sheetFailed, false);
    assert.deepEqual(result.warnings, []);
  });
});

describe("sheet failure without rollback", () => {
  it("keeps the assignment and OT record when the Google Sheet write fails", async () => {
    const failed = makeRecord({
      sheet_sync_status: "failed",
      sheet_row_number: null,
      sheet_synced_at: null,
      last_sheet_error: "Unable to write Over Target to Google Sheets.",
    });
    const result = await attachOverTargetsToAssignments(
      [{ assignmentId: "asg-1", overTarget: true, overTargetCount: 2 }],
      {
        weekDate: "10/5/2026",
        create: async () => ({ ok: true, record: failed }),
      }
    );

    assert.equal(result.records.length, 1);
    assert.equal(result.records[0]?.sheet_sync_status, "failed");
    assert.equal(result.sheetFailed, true);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0] ?? "", /was not rolled back/);
    assert.match(result.warnings[0] ?? "", /Unable to write Over Target to Google Sheets/);
  });
});

describe("idempotency", () => {
  it("does not create a duplicate Over Target record for the same assignment", async () => {
    const created: string[] = [];
    const existing = new Set<string>();

    async function create(input: OverTargetCreateInput): Promise<OverTargetCreateResult> {
      const assignmentId = String(input.assignmentId);
      if (existing.has(assignmentId)) {
        return { ok: false, error: "This assignment already has an Over Target record.", code: "DUPLICATE" };
      }
      existing.add(assignmentId);
      created.push(assignmentId);
      return { ok: true, record: makeRecord({ assignment_id: assignmentId }) };
    }

    const first = await attachOverTargetsToAssignments(
      [{ assignmentId: "asg-1", overTarget: true, overTargetCount: 1 }],
      { weekDate: "10/5/2026", create }
    );
    const second = await attachOverTargetsToAssignments(
      [{ assignmentId: "asg-1", overTarget: true, overTargetCount: 1 }],
      { weekDate: "10/5/2026", create }
    );

    assert.deepEqual(created, ["asg-1"]);
    assert.equal(first.records.length, 1);
    assert.deepEqual(second.records, []);
    assert.deepEqual(second.warnings, []);
    assert.equal(second.sheetFailed, false);
  });
});

describe("service-role insert", () => {
  it("uses the injected create client and does not create extra assignments", async () => {
    const clients: string[] = [];
    const result = await attachOverTargetsToAssignments(
      [{ assignmentId: "asg-1", overTarget: true, overTargetCount: 4 }],
      {
        weekDate: "10/5/2026",
        createdBy: "admin-1",
        create: async (input) => {
          clients.push("service-role");
          assert.equal(input.assignmentId, "asg-1");
          assert.equal(input.count, 4);
          return { ok: true, record: makeRecord({ assignment_id: "asg-1", count_value: 4 }) };
        },
      }
    );

    assert.deepEqual(clients, ["service-role"]);
    assert.equal(result.records.length, 1);
    assert.equal(result.warnings.length, 0);
  });

  it("wires Add Assignment Over Target writes through createServiceRoleClient", () => {
    const routePath = join(fileURLToPath(new URL(".", import.meta.url)), "../../app/api/matches/[matchId]/distribution/route.ts");
    const source = readFileSync(routePath, "utf8");
    assert.match(source, /createClient,\s*createServiceRoleClient/);
    assert.match(source, /const overTargetClient = createServiceRoleClient\(\)/);
    assert.match(source, /createOverTargetRecord\(overTargetClient,\s*input\)/);
    assert.equal(source.includes("createOverTargetRecord(supabase, input)"), false);
  });
});

describe("Add Assignment warning visibility", () => {
  it("keeps assignment success and surfaces Over Target sheet failure warnings", () => {
    const feedback = formatAddAssignmentFeedback({
      assignments: [{ id: "asg-1", task: "Live Data Collection", half: "Half 1" }],
      warnings: ["Over Target was saved in the database, but writing the Google Sheet row failed: Unable to write Over Target to Google Sheets. The Distribution assignment asg-1 was not rolled back. Retry the sheet write from Admin Over Target."],
      overTargetSheetFailed: true,
    });
    assert.equal(feedback.successMessage, "Assignment added successfully. Live Data Collection · Half 1 · asg-1");
    assert.equal(feedback.warnings.length, 1);
    assert.match(feedback.warnings[0] ?? "", /was not rolled back/);
  });

  it("does not show only a success message when overTargetSheetFailed is true", () => {
    const feedback = formatAddAssignmentFeedback({
      assignments: [{ id: "asg-2", task: "Pre-Match", half: "Half 2" }],
      overTargetSheetFailed: true,
    });
    assert.match(feedback.successMessage, /^Assignment added successfully/);
    assert.equal(feedback.warnings.length, 1);
    assert.match(feedback.warnings[0] ?? "", /Google Sheet row failed/);
  });

  it("shows success without warnings for a normal assignment", () => {
    const feedback = formatAddAssignmentFeedback({
      assignments: [{ id: "asg-3", task: "Live Data Collection", half: "Full Match" }],
      warnings: [],
      overTargetSheetFailed: false,
    });
    assert.equal(feedback.successMessage, "Assignment added successfully. Live Data Collection · Full Match · asg-3");
    assert.deepEqual(feedback.warnings, []);
  });
});

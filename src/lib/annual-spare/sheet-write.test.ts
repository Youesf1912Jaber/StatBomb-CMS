import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { runPendingAnnualLeaveSheetWrites } from "./sheet-apply-plan";
import {
  annualLeaveSheetDelta,
  combineAnnualSpareDeltas,
  formatAnnualSpareLastUpdate,
  groupPendingAnnualLeaveSheetWrites,
  isNoOpAnnualSpareDelta,
  planAnnualSpareWrite,
  typeSwitchAnnualSpareDelta,
  verifyAnnualSpareWrite,
  type AnnualSpareBalanceDelta,
} from "./write-plan";
import type { AnnualLeaveAction, AnnualLeaveType } from "../../types/database.types";

const dir = fileURLToPath(new URL(".", import.meta.url));

function headerRow(order?: string[]): unknown[] {
  return (
    order ?? [
      "Code",
      "Name",
      "Title",
      "Type",
      "Total available",
      "Available AL - R",
      "Available AL - C",
      "Last update",
    ]
  );
}

function dataRow(hrCode: string, total: unknown, alR: unknown, alC: unknown): unknown[] {
  return [hrCode, "Ada", "Senior", "Full Time", total, alR, alC, "01/10/2026"];
}

function sampleMatrix(rows: unknown[][]): unknown[][] {
  return [headerRow(), ...rows];
}

function pendingRow(input: {
  id: string;
  hr_code?: string;
  leave_type: AnnualLeaveType;
  action: AnnualLeaveAction;
  sheet_sync_status?: "pending" | "written" | "failed" | null;
}) {
  return {
    id: input.id,
    hr_code: input.hr_code ?? "C001",
    leave_type: input.leave_type,
    action: input.action,
    sheet_sync_status: input.sheet_sync_status ?? ("pending" as const),
  };
}

describe("annual spare balance deltas", () => {
  it("AL-R consume decrements Total and AL-R", () => {
    assert.deepEqual(annualLeaveSheetDelta("AL-R", "consume"), { total: -1, alR: -1, alC: 0 });
  });

  it("AL-R reverse increments Total and AL-R", () => {
    assert.deepEqual(annualLeaveSheetDelta("AL-R", "reverse"), { total: 1, alR: 1, alC: 0 });
  });

  it("AL-C consume decrements Total and AL-C", () => {
    assert.deepEqual(annualLeaveSheetDelta("AL-C", "consume"), { total: -1, alR: 0, alC: -1 });
  });

  it("AL-C reverse increments Total and AL-C", () => {
    assert.deepEqual(annualLeaveSheetDelta("AL-C", "reverse"), { total: 1, alR: 0, alC: 1 });
  });

  it("AL-R to AL-C is a type switch with Total 0", () => {
    assert.deepEqual(typeSwitchAnnualSpareDelta("AL-R", "AL-C"), { total: 0, alR: 1, alC: -1 });
    assert.deepEqual(
      combineAnnualSpareDeltas([
        annualLeaveSheetDelta("AL-R", "reverse"),
        annualLeaveSheetDelta("AL-C", "consume"),
      ]),
      { total: 0, alR: 1, alC: -1 }
    );
  });

  it("AL-C to AL-R is a type switch with Total 0", () => {
    assert.deepEqual(typeSwitchAnnualSpareDelta("AL-C", "AL-R"), { total: 0, alR: -1, alC: 1 });
    assert.deepEqual(
      combineAnnualSpareDeltas([
        annualLeaveSheetDelta("AL-C", "reverse"),
        annualLeaveSheetDelta("AL-R", "consume"),
      ]),
      { total: 0, alR: -1, alC: 1 }
    );
  });
});

describe("annual spare write planning", () => {
  it("applies an AL-R consume to the matching HR-Code row", () => {
    const plan = planAnnualSpareWrite({
      matrix: sampleMatrix([dataRow("c001", "20", "12", "8")]),
      hrCode: "C001",
      delta: annualLeaveSheetDelta("AL-R", "consume"),
    });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.target.rowNumber, 2);
    assert.equal(plan.target.nextTotal, 19);
    assert.equal(plan.target.nextAlR, 11);
    assert.equal(plan.target.nextAlC, 8);
  });

  it("applies an AL-R reverse", () => {
    const plan = planAnnualSpareWrite({
      matrix: sampleMatrix([dataRow("C001", 10, 4, 6)]),
      hrCode: "C001",
      delta: annualLeaveSheetDelta("AL-R", "reverse"),
    });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.deepEqual([plan.target.nextTotal, plan.target.nextAlR, plan.target.nextAlC], [11, 5, 6]);
  });

  it("applies an AL-C consume", () => {
    const plan = planAnnualSpareWrite({
      matrix: sampleMatrix([dataRow("C001", 10, 4, 6)]),
      hrCode: "C001",
      delta: annualLeaveSheetDelta("AL-C", "consume"),
    });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.deepEqual([plan.target.nextTotal, plan.target.nextAlR, plan.target.nextAlC], [9, 4, 5]);
  });

  it("applies an AL-C reverse", () => {
    const plan = planAnnualSpareWrite({
      matrix: sampleMatrix([dataRow("C001", 10, 4, 6)]),
      hrCode: "C001",
      delta: annualLeaveSheetDelta("AL-C", "reverse"),
    });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.deepEqual([plan.target.nextTotal, plan.target.nextAlR, plan.target.nextAlC], [11, 4, 7]);
  });

  it("applies AL-R to AL-C without changing Total", () => {
    const plan = planAnnualSpareWrite({
      matrix: sampleMatrix([dataRow("C001", 10, 4, 6)]),
      hrCode: "C001",
      delta: typeSwitchAnnualSpareDelta("AL-R", "AL-C"),
    });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.deepEqual([plan.target.nextTotal, plan.target.nextAlR, plan.target.nextAlC], [10, 5, 5]);
  });

  it("applies AL-C to AL-R without changing Total", () => {
    const plan = planAnnualSpareWrite({
      matrix: sampleMatrix([dataRow("C001", 10, 4, 6)]),
      hrCode: "C001",
      delta: typeSwitchAnnualSpareDelta("AL-C", "AL-R"),
    });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.deepEqual([plan.target.nextTotal, plan.target.nextAlR, plan.target.nextAlC], [10, 3, 7]);
  });

  it("rejects a negative resulting balance", () => {
    const plan = planAnnualSpareWrite({
      matrix: sampleMatrix([dataRow("C001", "0", "0", "1")]),
      hrCode: "C001",
      delta: annualLeaveSheetDelta("AL-R", "consume"),
    });
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.reason, "negative_balance");
  });

  it("rejects a duplicate HR-Code", () => {
    const plan = planAnnualSpareWrite({
      matrix: sampleMatrix([dataRow("C001", 10, 4, 6), dataRow(" c001 ", 9, 3, 6)]),
      hrCode: "C001",
      delta: annualLeaveSheetDelta("AL-R", "consume"),
    });
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.reason, "duplicate_hr_code");
  });

  it("rejects a missing HR-Code", () => {
    const plan = planAnnualSpareWrite({
      matrix: sampleMatrix([dataRow("C002", 10, 4, 6)]),
      hrCode: "C001",
      delta: annualLeaveSheetDelta("AL-R", "consume"),
    });
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.reason, "missing_hr_code");
  });

  it("rejects a null or unparseable balance", () => {
    const nullPlan = planAnnualSpareWrite({
      matrix: sampleMatrix([dataRow("C001", "", 4, 6)]),
      hrCode: "C001",
      delta: annualLeaveSheetDelta("AL-R", "consume"),
    });
    assert.equal(nullPlan.ok, false);
    if (nullPlan.ok) return;
    assert.equal(nullPlan.reason, "invalid_balance");

    const invalidPlan = planAnnualSpareWrite({
      matrix: sampleMatrix([dataRow("C001", "20", "—", "8")]),
      hrCode: "C001",
      delta: annualLeaveSheetDelta("AL-R", "consume"),
    });
    assert.equal(invalidPlan.ok, false);
    if (invalidPlan.ok) return;
    assert.equal(invalidPlan.reason, "invalid_balance");
  });

  it("detects headers independent of column order", () => {
    const plan = planAnnualSpareWrite({
      matrix: [
        ["Last update", "Available AL - C", "Name", "Code", "Total available", "Type", "Title", "Available AL - R"],
        ["01/10/2026", "8", "Ada", "c001", "20", "Full Time", "Senior", "12"],
      ],
      hrCode: "C001",
      delta: annualLeaveSheetDelta("AL-C", "consume"),
    });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.columns.code, 3);
    assert.equal(plan.columns.totalAvailable, 4);
    assert.equal(plan.columns.availableAlR, 7);
    assert.equal(plan.columns.availableAlC, 1);
    assert.equal(plan.target.nextTotal, 19);
    assert.equal(plan.target.nextAlC, 7);
  });
});

describe("annual spare write verification", () => {
  it("accepts an exact match and rejects a mismatch", () => {
    const ok = verifyAnnualSpareWrite({
      row: {
        hr_code: "C001",
        name: "Ada",
        title: "Senior",
        type: "Full Time",
        total_available: 19,
        available_al_r: 11,
        available_al_c: 8,
        last_update: "08/10/2026",
        source_row_number: 2,
      },
      expectedHrCode: "c001",
      expectedTotal: 19,
      expectedAlR: 11,
      expectedAlC: 8,
    });
    assert.equal(ok.ok, true);

    const failed = verifyAnnualSpareWrite({
      row: {
        hr_code: "C001",
        name: "Ada",
        title: "Senior",
        type: "Full Time",
        total_available: 18,
        available_al_r: 11,
        available_al_c: 8,
        last_update: "08/10/2026",
        source_row_number: 2,
      },
      expectedHrCode: "C001",
      expectedTotal: 19,
      expectedAlR: 11,
      expectedAlC: 8,
    });
    assert.equal(failed.ok, false);
  });

  it("uses dd/MM/yyyy for Last update", () => {
    assert.equal(formatAnnualSpareLastUpdate(new Date(Date.UTC(2026, 9, 8))), "08/10/2026");
  });
});

describe("pending annual spare apply", () => {
  it("marks a successful write as written", async () => {
    const calls: AnnualSpareBalanceDelta[] = [];
    const run = await runPendingAnnualLeaveSheetWrites(
      [pendingRow({ id: "row-1", leave_type: "AL-R", action: "consume" })],
      async ({ delta }) => {
        calls.push(delta);
        return { ok: true };
      }
    );
    assert.equal(run.writeCalls, 1);
    assert.deepEqual(run.mutations, [{ id: "row-1", kind: "written" }]);
    assert.deepEqual(calls, [{ total: -1, alR: -1, alC: 0 }]);
  });

  it("marks a failed write as failed and preserves the error", async () => {
    const run = await runPendingAnnualLeaveSheetWrites(
      [pendingRow({ id: "row-1", leave_type: "AL-C", action: "consume" })],
      async () => ({ ok: false, message: "Google Sheets could not be read." })
    );
    assert.equal(run.writeCalls, 1);
    assert.deepEqual(run.mutations, [{ id: "row-1", kind: "failed", error: "Google Sheets could not be read." }]);
  });

  it("marks verification failure as failed", async () => {
    const run = await runPendingAnnualLeaveSheetWrites(
      [pendingRow({ id: "row-1", leave_type: "AL-R", action: "consume" })],
      async () => ({ ok: false, message: "Annual Spare Total available did not match the expected result." })
    );
    assert.equal(run.mutations[0]?.kind, "failed");
    if (run.mutations[0]?.kind !== "failed") return;
    assert.match(run.mutations[0].error, /Total available/);
  });

  it("aggregates multiple pending rows for the same HR-Code into one write", async () => {
    const calls: Array<{ hrCode: string; delta: AnnualSpareBalanceDelta }> = [];
    const run = await runPendingAnnualLeaveSheetWrites(
      [
        pendingRow({ id: "al-r", leave_type: "AL-R", action: "reverse" }),
        pendingRow({ id: "al-c", leave_type: "AL-C", action: "consume" }),
      ],
      async ({ hrCode, delta }) => {
        calls.push({ hrCode, delta });
        return { ok: true };
      }
    );
    assert.equal(run.writeCalls, 1);
    assert.deepEqual(calls, [{ hrCode: "C001", delta: { total: 0, alR: 1, alC: -1 } }]);
    assert.equal(run.mutations.length, 2);
    assert.equal(run.mutations.every((item) => item.kind === "written"), true);
  });

  it("does not write when there are no pending rows", async () => {
    let called = false;
    const run = await runPendingAnnualLeaveSheetWrites([], async () => {
      called = true;
      return { ok: true };
    });
    assert.equal(called, false);
    assert.equal(run.writeCalls, 0);
    assert.equal(run.mutations.length, 0);
  });

  it("does not automatically process failed rows", async () => {
    let called = false;
    const run = await runPendingAnnualLeaveSheetWrites(
      [pendingRow({ id: "row-failed", leave_type: "AL-R", action: "consume", sheet_sync_status: "failed" })],
      async () => {
        called = true;
        return { ok: true };
      }
    );
    assert.equal(called, false);
    assert.equal(run.writeCalls, 0);
    assert.equal(run.mutations.length, 0);
    assert.equal(
      groupPendingAnnualLeaveSheetWrites([
        pendingRow({ id: "row-failed", leave_type: "AL-R", action: "consume", sheet_sync_status: "failed" }),
      ]).length,
      0
    );
  });

  it("does not process written rows and does not double-apply on retry", async () => {
    const pending = [
      pendingRow({ id: "row-1", leave_type: "AL-R", action: "consume", sheet_sync_status: "written" }),
    ];
    assert.equal(groupPendingAnnualLeaveSheetWrites(pending).length, 0);

    let calls = 0;
    const first = await runPendingAnnualLeaveSheetWrites(
      [pendingRow({ id: "row-1", leave_type: "AL-R", action: "consume" })],
      async () => {
        calls += 1;
        return { ok: true };
      }
    );
    const alreadyWritten = first.mutations.map((item) => ({
      ...pendingRow({ id: item.id, leave_type: "AL-R", action: "consume", sheet_sync_status: "written" }),
    }));
    const second = await runPendingAnnualLeaveSheetWrites(alreadyWritten, async () => {
      calls += 1;
      return { ok: true };
    });
    assert.equal(calls, 1);
    assert.equal(second.writeCalls, 0);
    assert.equal(second.mutations.length, 0);
  });

  it("treats a net-zero pending group as written without a Sheet write", async () => {
    let called = false;
    const run = await runPendingAnnualLeaveSheetWrites(
      [
        pendingRow({ id: "consume", leave_type: "AL-R", action: "consume" }),
        pendingRow({ id: "reverse", leave_type: "AL-R", action: "reverse" }),
      ],
      async () => {
        called = true;
        return { ok: true };
      }
    );
    assert.equal(called, false);
    assert.equal(run.writeCalls, 0);
    assert.equal(isNoOpAnnualSpareDelta({ total: 0, alR: 0, alC: 0 }), true);
    assert.deepEqual(
      run.mutations.map((item) => item.kind),
      ["written", "written"]
    );
  });
});

describe("annual spare writer wiring", () => {
  it("writes per-cell with USER_ENTERED and verifies before marking written", () => {
    const writer = readFileSync(join(dir, "sheet-write.ts"), "utf8");
    const apply = readFileSync(join(dir, "sheet-apply.ts"), "utf8");
    const plan = readFileSync(join(dir, "sheet-apply-plan.ts"), "utf8");
    const helpers = readFileSync(join(dir, "sheet-sync.ts"), "utf8");
    const sheet = readFileSync(join(dir, "sheet.ts"), "utf8");

    assert.match(writer, /server-only/);
    assert.match(writer, /values:batchUpdate/);
    assert.match(writer, /valueInputOption: "USER_ENTERED"/);
    assert.match(writer, /plan\.columns\.totalAvailable/);
    assert.match(writer, /plan\.columns\.availableAlR/);
    assert.match(writer, /plan\.columns\.availableAlC/);
    assert.match(writer, /plan\.columns\.lastUpdate/);
    assert.equal(writer.includes(":append"), false);
    assert.equal(sheet.includes("values:batchUpdate"), false);
    assert.match(plan, /groupPendingAnnualLeaveSheetWrites/);
    assert.match(apply, /getPendingAnnualLeaveSheetSyncRows/);
    assert.match(apply, /markAnnualLeaveSheetSyncWritten/);
    assert.match(apply, /markAnnualLeaveSheetSyncFailed/);
    assert.match(apply, /retryFailedAnnualLeaveSheetWrites/);
    assert.match(helpers, /requeueFailedAnnualLeaveSheetSyncRows/);
    assert.match(helpers, /\.eq\("sheet_sync_status", "failed"\)/);
  });

  it("applies pending Annual Spare writes after ledger reconcile on both Expected paths", () => {
    const ledgerSync = readFileSync(join(dir, "ledger-sync.ts"), "utf8");
    const expectedSync = readFileSync(join(dir, "../expected/sync.ts"), "utf8");
    const patch = readFileSync(join(dir, "../../app/api/admin/expected/weeks/[weekId]/route.ts"), "utf8");
    const apply = readFileSync(join(dir, "sheet-apply.ts"), "utf8");

    assert.match(ledgerSync, /await applyPendingAnnualLeaveSheetWrites\(client\)/);
    const insertIndex = ledgerSync.indexOf("await insertRows");
    const applyIndex = ledgerSync.indexOf("await applyPendingAnnualLeaveSheetWrites");
    assert.ok(insertIndex >= 0 && applyIndex > insertIndex);

    assert.match(expectedSync, /await reconcileAnnualLeaveLedger\(client, sheet\.weeks\)/);
    assert.match(patch, /await updateExpectedDailyValue/);
    assert.match(patch, /await reconcileAnnualLeaveLedger\(createServiceRoleClient\(\), data\.weeks\)/);
    const writeIndex = patch.indexOf("await updateExpectedDailyValue");
    const reconcileIndex = patch.indexOf("await reconcileAnnualLeaveLedger");
    assert.ok(writeIndex >= 0 && reconcileIndex > writeIndex);

    assert.equal(apply.includes("window"), false);
    assert.match(apply, /server-only/);
  });

  it("does not automatically retry failed rows and never re-applies written rows", () => {
    const apply = readFileSync(join(dir, "sheet-apply.ts"), "utf8");
    const helpers = readFileSync(join(dir, "sheet-sync.ts"), "utf8");
    assert.match(apply, /getPendingAnnualLeaveSheetSyncRows/);
    assert.match(apply, /requeueFailedAnnualLeaveSheetSyncRows/);
    assert.equal(apply.includes('.eq("sheet_sync_status", "failed")'), false);
    assert.match(helpers, /\.eq\("sheet_sync_status", "pending"\)/);
    assert.match(helpers, /\.eq\("sheet_sync_status", "failed"\)/);
  });
});

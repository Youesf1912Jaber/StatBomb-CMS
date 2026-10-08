import type { AnnualLeaveLedgerRow } from "../../types/database.types";
import {
  groupPendingAnnualLeaveSheetWrites,
  isNoOpAnnualSpareDelta,
  type AnnualSpareBalanceDelta,
} from "./write-plan";

export type AnnualSpareSheetWriter = (input: {
  hrCode: string;
  delta: AnnualSpareBalanceDelta;
  now?: Date;
}) => Promise<{ ok: true } | { ok: false; message: string }>;

export type PendingSheetWriteMutation =
  | { id: string; kind: "written" }
  | { id: string; kind: "failed"; error: string };

export type PendingSheetWriteRun = {
  mutations: PendingSheetWriteMutation[];
  writeCalls: number;
  groups: number;
};

export async function runPendingAnnualLeaveSheetWrites(
  pending: Pick<AnnualLeaveLedgerRow, "id" | "hr_code" | "leave_type" | "action" | "sheet_sync_status">[],
  writer: AnnualSpareSheetWriter,
  now: Date = new Date()
): Promise<PendingSheetWriteRun> {
  const groups = groupPendingAnnualLeaveSheetWrites(pending);
  const mutations: PendingSheetWriteMutation[] = [];
  let writeCalls = 0;

  for (const group of groups) {
    if (group.rows.length === 0) continue;

    if (isNoOpAnnualSpareDelta(group.delta)) {
      for (const row of group.rows) {
        mutations.push({ id: row.id, kind: "written" });
      }
      continue;
    }

    writeCalls += 1;
    try {
      const result = await writer({ hrCode: group.hrCode, delta: group.delta, now });
      if (result.ok) {
        for (const row of group.rows) {
          mutations.push({ id: row.id, kind: "written" });
        }
      } else {
        for (const row of group.rows) {
          mutations.push({ id: row.id, kind: "failed", error: result.message });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      for (const row of group.rows) {
        mutations.push({ id: row.id, kind: "failed", error: message });
      }
    }
  }

  return { mutations, writeCalls, groups: groups.length };
}

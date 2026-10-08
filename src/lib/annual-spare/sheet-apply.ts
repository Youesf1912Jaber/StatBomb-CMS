import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.types";
import { runPendingAnnualLeaveSheetWrites, type AnnualSpareSheetWriter } from "./sheet-apply-plan";
import {
  getPendingAnnualLeaveSheetSyncRows,
  markAnnualLeaveSheetSyncFailed,
  markAnnualLeaveSheetSyncWritten,
  requeueFailedAnnualLeaveSheetSyncRows,
} from "./sheet-sync";
import { writeAnnualSpareBalanceDelta } from "./sheet-write";

type Client = SupabaseClient<Database>;

export type AnnualLeaveSheetApplyResult = {
  pending: number;
  written: number;
  failed: number;
  writeCalls: number;
};

function defaultWriter(): AnnualSpareSheetWriter {
  return async (input) => writeAnnualSpareBalanceDelta(input);
}

export async function applyPendingAnnualLeaveSheetWrites(
  client: Client,
  options?: { writer?: AnnualSpareSheetWriter; now?: Date }
): Promise<AnnualLeaveSheetApplyResult> {
  const pending = await getPendingAnnualLeaveSheetSyncRows(client);
  if (pending.length === 0) {
    return { pending: 0, written: 0, failed: 0, writeCalls: 0 };
  }

  const now = options?.now ?? new Date();
  const run = await runPendingAnnualLeaveSheetWrites(
    pending,
    options?.writer ?? defaultWriter(),
    now
  );
  const appliedAt = now.toISOString();
  let written = 0;
  let failed = 0;

  for (const mutation of run.mutations) {
    if (mutation.kind === "written") {
      await markAnnualLeaveSheetSyncWritten(client, mutation.id, appliedAt);
      written += 1;
    } else {
      await markAnnualLeaveSheetSyncFailed(client, mutation.id, mutation.error);
      failed += 1;
    }
  }

  return { pending: pending.length, written, failed, writeCalls: run.writeCalls };
}

export async function retryFailedAnnualLeaveSheetWrites(
  client: Client,
  ids: string[],
  options?: { writer?: AnnualSpareSheetWriter; now?: Date }
): Promise<AnnualLeaveSheetApplyResult> {
  await requeueFailedAnnualLeaveSheetSyncRows(client, ids);
  return applyPendingAnnualLeaveSheetWrites(client, options);
}

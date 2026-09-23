import "server-only";

import type { DistributionMatchRow } from "@/lib/sync/google-sheets";
import { reconcileDistributionPresence, type DistributionReconciliation } from "@/lib/sync/reconcile";
import type { AssignmentRow, Database, MatchRow } from "@/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function persistDistributionPresence(
  supabase: SupabaseClient<Database>,
  presentAssignmentIds: string[],
  matchId?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("reconcile_distribution_presence", {
    p_present_ids: presentAssignmentIds,
    p_match_id: matchId ?? null,
  });
  if (error) throw error;
}

export async function persistReconciledDistributionPresence(
  supabase: SupabaseClient<Database>,
  input: {
    distributionRows: Array<Pick<DistributionMatchRow, "match_id" | "task" | "half">>;
    assignments: AssignmentRow[];
    matches: MatchRow[];
    matchId?: string | null;
  },
): Promise<DistributionReconciliation> {
  const reconciliation = reconcileDistributionPresence(input);
  await persistDistributionPresence(supabase, reconciliation.presentAssignmentIds, input.matchId);
  return reconciliation;
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { SlaAlertAssignment } from "./sla-alarm";

export type SlaAlertScope = "admin" | "collector";

/**
 * Loads only assignments whose SLA deadline is within the next hour.
 * The database joins the required match/collector fields in one compact RPC,
 * avoiding full assignment history and batched matches-table reads in the browser.
 */
export async function getSlaAlertItems(
  client: SupabaseClient<Database>,
  scope: SlaAlertScope,
): Promise<SlaAlertAssignment[]> {
  const { data, error } = await client.rpc("get_sla_alert_assignments", { p_scope: scope });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    assignmentId: row.assignment_id,
    sla: row.sla,
    status: row.status,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    competition: row.competition,
    collectorName: row.collector_name,
    half: row.half,
    task: row.task,
  }));
}

import "server-only";

import type { DistributionMatchRow } from "@/lib/sync/google-sheets";
import { normalizeDistributionCollectorHrCode, normalizeDistributionHalf, normalizeDistributionTask, normalizeMatchId } from "@/lib/sync/google-sheets";
import type { AssignmentHalf, AssignmentRow, MatchRow, ProfileRow } from "@/types/database.types";

const VALID_HALVES = new Set<AssignmentHalf>(["Half 1", "Half 2", "Half 3", "Half 4", "Full Match"]);

export type DistributionAssignmentPlan = {
  row: DistributionMatchRow;
  collector: ProfileRow;
  match: MatchRow;
  task: string;
  half: AssignmentHalf;
  sla: string;
  shiftDate: string | null;
};

export type DistributionAssignmentPlanResult =
  | { ok: true; plan: DistributionAssignmentPlan }
  | { ok: false; reason: string; conflict: boolean };

function toSla(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Resolves one operational Distribution row to the immutable database IDs
 * used by create_assignment. Names are display-only; HR-Code is the sole
 * collector identity input.
 */
export function planDistributionAssignment(
  row: DistributionMatchRow,
  profiles: ProfileRow[],
  matches: MatchRow[],
  assignments: AssignmentRow[],
): DistributionAssignmentPlanResult {
  const externalId = normalizeMatchId(row.match_id);
  if (!externalId) return { ok: false, conflict: false, reason: "Distribution row has no valid Match ID." };
  const match = matches.find((candidate) => normalizeMatchId(candidate.external_id) === externalId);
  if (!match) return { ok: false, conflict: false, reason: "Match ID was not found in Supabase matches." };

  const hrCode = normalizeDistributionCollectorHrCode(row.collector_hr_code);
  const collector = hrCode
    ? profiles.find((candidate) => normalizeDistributionCollectorHrCode(candidate.hr_code) === hrCode)
    : undefined;
  if (!collector) return { ok: false, conflict: false, reason: "HR-Code does not resolve to a Supabase profile." };
  if (collector.role !== "collector" || collector.deleted_at || collector.suspended_at) {
    return { ok: false, conflict: false, reason: "HR-Code does not resolve to an active collector." };
  }

  const task = normalizeDistributionTask(row.task);
  if (!task) return { ok: false, conflict: false, reason: "Distribution task is required." };
  const half = normalizeDistributionHalf(row.half);
  if (!VALID_HALVES.has(half as AssignmentHalf)) {
    return { ok: false, conflict: false, reason: "Distribution half is invalid." };
  }

  const sla = toSla(row.sla);
  if (!sla) return { ok: false, conflict: false, reason: "Distribution SLA must be a valid date/time." };

  const existing = assignments.find(
    (candidate) => candidate.match_id === match.id && candidate.task === task && candidate.half === half,
  );
  if (existing) {
    return {
      ok: false,
      conflict: existing.collector_id !== collector.id,
      reason: existing.collector_id === collector.id
        ? "This logical assignment already exists."
        : "A different collector already owns this Match + Task + Half assignment.",
    };
  }

  return { ok: true, plan: { row, collector, match, task, half: half as AssignmentHalf, sla, shiftDate: row.shift_date } };
}

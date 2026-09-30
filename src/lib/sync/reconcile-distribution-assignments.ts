import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { planDistributionAssignment } from "@/lib/distribution-assignments";
import { fetchAllMatches } from "@/lib/match-master-preview";
import { type DistributionMatchRow, readDistributionRowsForPreview } from "@/lib/sync/google-sheets";
import { distributionRowLogicalKey } from "@/lib/sync/reconcile";
import { persistReconciledDistributionPresence } from "@/lib/sync/persist-distribution-presence";
import type { AssignmentRow, Database, ProfileRow } from "@/types/database.types";

type Client = SupabaseClient<Database>;

export type DistributionAssignmentReconciliation = {
  inserted: number;
  updated: number;
  restored: number;
  present: number;
  missing: number;
  skipped: number;
};

type RpcErrorFields = {
  message: string;
  code: string;
  details: string;
  hint: string;
};

function fieldText(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

function rpcErrorFields(error: unknown): RpcErrorFields {
  const candidate = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  return {
    message: fieldText(candidate.message),
    code: fieldText(candidate.code),
    details: fieldText(candidate.details),
    hint: fieldText(candidate.hint),
  };
}

const SECRET_PATTERN =
  /(?:postgres(?:ql)?:\/\/|mongodb(?:\+srv)?:\/\/)\S+|(?:bearer\s+)[a-z0-9._\-]+|(?:(?:api[_-]?key|secret|password|token|authorization|private[_-]?key)\s*[:=]\s*)\S+|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]+|-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/gi;

function sanitizeDiagnosticText(value: string): string {
  return value.replace(SECRET_PATTERN, "[redacted]").replace(/\s+/g, " ").trim().slice(0, 400);
}

export class DistributionRefreshRpcError extends Error {
  readonly raw_row_number: number;
  readonly match_id: string;
  readonly collector_hr_code: string | null;
  readonly task: string | null;
  readonly half: string | null;
  readonly operation: string;
  readonly rpcMessage: string;
  readonly rpcCode: string;
  readonly rpcDetails: string;
  readonly rpcHint: string;
  readonly originalError: unknown;
  readonly safeMessage: string;

  constructor(row: DistributionMatchRow, operation: string, error: unknown) {
    const rpc = rpcErrorFields(error);
    const safeMessage = [
      "Unable to refresh Distribution.",
      `row=${row.raw_row_number}`,
      `match_id=${sanitizeDiagnosticText(row.match_id)}`,
      `hr_code=${sanitizeDiagnosticText(row.collector_hr_code ?? "")}`,
      `task=${sanitizeDiagnosticText(row.task ?? "")}`,
      `half=${sanitizeDiagnosticText(row.half ?? "")}`,
      `operation=${operation}`,
      rpc.code ? `code=${sanitizeDiagnosticText(rpc.code)}` : "",
      rpc.message ? `message=${sanitizeDiagnosticText(rpc.message)}` : "",
      rpc.details ? `details=${sanitizeDiagnosticText(rpc.details)}` : "",
      rpc.hint ? `hint=${sanitizeDiagnosticText(rpc.hint)}` : "",
    ].filter(Boolean).join(" ");
    super(safeMessage);
    this.name = "DistributionRefreshRpcError";
    this.raw_row_number = row.raw_row_number;
    this.match_id = row.match_id;
    this.collector_hr_code = row.collector_hr_code;
    this.task = row.task;
    this.half = row.half;
    this.operation = operation;
    this.rpcMessage = rpc.message;
    this.rpcCode = rpc.code;
    this.rpcDetails = rpc.details;
    this.rpcHint = rpc.hint;
    this.originalError = error;
    this.safeMessage = safeMessage;
    this.cause = error;
  }
}

function throwRpcError(row: DistributionMatchRow, operation: string, error: unknown): never {
  const rpc = rpcErrorFields(error);
  const diagnostic = new DistributionRefreshRpcError(row, operation, error);
  console.error("Distribution assignment RPC failed", {
    raw_row_number: row.raw_row_number,
    match_id: row.match_id,
    collector_hr_code: row.collector_hr_code,
    task: row.task,
    half: row.half,
    operation,
    message: rpc.message,
    code: rpc.code,
    details: rpc.details,
    hint: rpc.hint,
    originalError: error,
  });
  throw diagnostic;
}

async function createOrUpdateAssignment(
  supabase: Client,
  row: DistributionMatchRow,
  profiles: ProfileRow[],
  matches: Awaited<ReturnType<typeof fetchAllMatches>>,
  assignments: AssignmentRow[],
): Promise<"inserted" | "updated" | "restored" | "skipped"> {
  const planned = planDistributionAssignment(row, profiles, matches, assignments, {
    allowExistingCollectorUpdate: true,
  });
  if (!planned.ok) return "skipped";

  const { plan } = planned;
  if (!plan.existing) {
    const { data, error } = await supabase.rpc("create_assignment", {
      p_match_id: plan.match.id,
      p_collector_id: plan.collector.id,
      p_raw_task_value: plan.row.task ?? plan.task,
      p_task: plan.task,
      p_half: plan.half,
      p_sla: plan.sla,
      p_shift_date: plan.shiftDate,
    });
    if (error) throwRpcError(row, "create_assignment", error);
    assignments.push(data);
    return "inserted";
  }

  let assignment = plan.existing;
  let changed = false;
  if (assignment.collector_id !== plan.collector.id) {
    const { data, error } = await supabase.rpc("reassign_assignment", {
      p_assignment_id: assignment.id,
      p_new_collector_id: plan.collector.id,
      p_mode: "preserve",
    });
    if (error) throwRpcError(row, "reassign_assignment", error);
    assignment = data;
    changed = true;
  }

  if (assignment.sla !== plan.sla) {
    const { data, error } = await supabase.rpc("update_assignment", {
      p_assignment_id: assignment.id,
      p_task: assignment.task,
      p_half: assignment.half,
      p_sla: plan.sla,
      p_notes: assignment.notes,
    });
    if (error) throwRpcError(row, "update_assignment", error);
    assignment = data;
    changed = true;
  }

  if (assignment.shift_date !== plan.shiftDate) {
    const { data, error } = await supabase.rpc("update_distribution_details", {
      p_assignment_id: assignment.id,
      p_shift_date: plan.shiftDate,
      p_official_website_url: plan.match.official_website_url,
    });
    if (error) throwRpcError(row, "update_distribution_details", error);
    assignment = data;
    changed = true;
  }

  const index = assignments.findIndex((candidate) => candidate.id === assignment.id);
  if (index >= 0) assignments[index] = assignment;

  if (!plan.existing.distribution_present) return "restored";
  return changed ? "updated" : "skipped";
}

/**
 * Reconciles current Distribution sheet rows into the existing logical
 * assignment population, preserving execution history for reused rows.
 */
export async function reconcileDistributionAssignments(
  supabase: Client,
): Promise<DistributionAssignmentReconciliation> {
  const [distributionRows, profilesResult, matches, assignmentsResult] = await Promise.all([
    readDistributionRowsForPreview(),
    supabase.from("profiles").select("*"),
    fetchAllMatches(supabase),
    supabase.from("assignments").select("*"),
  ]);
  if (profilesResult.error) throw profilesResult.error;
  if (assignmentsResult.error) throw assignmentsResult.error;

  const assignments = [...(assignmentsResult.data ?? [])];
  const result: DistributionAssignmentReconciliation = {
    inserted: 0,
    updated: 0,
    restored: 0,
    present: 0,
    missing: 0,
    skipped: 0,
  };
  const logicalKeyCounts = new Map<string, number>();
  for (const row of distributionRows) {
    const logicalKey = distributionRowLogicalKey(row);
    if (logicalKey) {
      logicalKeyCounts.set(logicalKey, (logicalKeyCounts.get(logicalKey) ?? 0) + 1);
    }
  }

  for (const row of distributionRows) {
    const logicalKey = distributionRowLogicalKey(row);
    if (!logicalKey || logicalKeyCounts.get(logicalKey) !== 1) {
      result.skipped += 1;
      continue;
    }

    const outcome = await createOrUpdateAssignment(
      supabase,
      row,
      profilesResult.data ?? [],
      matches,
      assignments,
    );
    result[outcome] += 1;
  }

  const currentAssignments = await supabase.from("assignments").select("*");
  if (currentAssignments.error) throw currentAssignments.error;
  const presence = await persistReconciledDistributionPresence(supabase, {
    distributionRows,
    assignments: currentAssignments.data ?? assignments,
    matches,
  });

  result.present = presence.presentAssignmentIds.length;
  result.missing = presence.missingAssignmentIds.length;
  return result;
}

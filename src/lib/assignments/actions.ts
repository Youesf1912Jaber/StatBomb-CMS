"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import { translateSupabaseError, type AppErrorCode } from "@/lib/errors";
import { isAssignmentTaskName } from "./task-names";
import { updateDistributionStatuses, type DistributionStatusUpdate } from "@/lib/sync/google-sheets";

export interface AssignmentActionState {
  error: string | null;
  errorCode: AppErrorCode | null;
  warning?: string | null;
}

const OK: AssignmentActionState = { error: null, errorCode: null };

async function distributionStatusUpdateForAssignment(
  supabase: ReturnType<typeof createClient>,
  assignmentId: string,
  status: DistributionStatusUpdate["status"],
): Promise<DistributionStatusUpdate> {
  const { data: assignment, error: assignmentError } = await supabase
    .from("assignments")
    .select("*")
    .eq("id", assignmentId)
    .single();
  if (assignmentError || !assignment) throw assignmentError ?? new Error("Assignment not found.");

  const [{ data: match, error: matchError }, { data: collector, error: collectorError }] = await Promise.all([
    supabase.from("matches").select("external_id").eq("id", assignment.match_id).single(),
    supabase.from("profiles").select("hr_code").eq("id", assignment.collector_id).single(),
  ]);
  if (matchError || !match) throw matchError ?? new Error("Match not found.");
  if (collectorError || !collector) throw collectorError ?? new Error("Collector not found.");

  return {
    matchId: match.external_id,
    collectorHrCode: collector.hr_code ?? "",
    task: assignment.raw_task_value ?? assignment.task,
    half: assignment.half,
    status,
  };
}

async function syncAssignmentStatusToSheet(
  supabase: ReturnType<typeof createClient>,
  assignmentId: string,
  status: DistributionStatusUpdate["status"],
): Promise<string | null> {
  try {
    const update = await distributionStatusUpdateForAssignment(supabase, assignmentId, status);
    await updateDistributionStatuses([update]);
    return null;
  } catch (error) {
    console.error("Assignment status changed in app but Distribution status sync failed", {
      assignmentId,
      status,
      error,
    });
    return status === "In Progress"
      ? "Work started in the app, but the Google Sheets Status could not be updated to In Progress. Check the Distribution row and sheet connection."
      : "Assignment was completed in the app, but its Google Sheets Status could not be updated. Check the Distribution row and retry after fixing the sheet connection.";
  }
}

async function fetchCompletedDistributionAssignments(
  supabase: ReturnType<typeof createClient>,
  assignmentIds: string[],
) {
  const assignments: Array<{
    id: string;
    match_id: string;
    collector_id: string;
    task: string;
    raw_task_value: string | null;
    half: string;
  }> = [];
  // Only sync the assignments affected by this button press. Never scan every
  // historical completed assignment on the sheet.
  for (let offset = 0; offset < assignmentIds.length; offset += 100) {
    const ids = assignmentIds.slice(offset, offset + 100);
    const { data, error } = await supabase
      .from("assignments")
      .select("id, match_id, collector_id, task, raw_task_value, half")
      .in("id", ids)
      .eq("distribution_present", true)
      .eq("hidden_from_admin_dashboard", false)
      .eq("status", "Completed");
    if (error) throw error;
    assignments.push(...(data ?? []));
  }
  return assignments;
}

async function fetchCurrentDistributionAssignmentIds(
  supabase: ReturnType<typeof createClient>,
): Promise<string[]> {
  const ids: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("assignments")
      .select("id")
      .eq("distribution_present", true)
      .eq("hidden_from_admin_dashboard", false)
      .in("status", ["Not Started", "In Progress", "Overdue"])
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    const page = data ?? [];
    ids.push(...page.map((row) => row.id));
    if (page.length < 1000) break;
  }
  return ids;
}

async function syncCurrentDistributionCompletionsToSheet(
  supabase: ReturnType<typeof createClient>,
  assignmentIds: string[],
): Promise<string | null> {
  try {
    const rows = await fetchCompletedDistributionAssignments(supabase, assignmentIds);
    if (rows.length === 0) return null;

    const collectorIds = [...new Set(rows.map((row) => row.collector_id))];
    const matchIds = [...new Set(rows.map((row) => row.match_id))];
    const collectors: Array<{ id: string; hr_code: string | null }> = [];
    const matches: Array<{ id: string; external_id: string }> = [];
    for (let offset = 0; offset < collectorIds.length; offset += 100) {
      const { data, error } = await supabase.from("profiles").select("id, hr_code").in("id", collectorIds.slice(offset, offset + 100));
      if (error) throw error;
      collectors.push(...(data ?? []));
    }
    for (let offset = 0; offset < matchIds.length; offset += 100) {
      const { data, error } = await supabase.from("matches").select("id, external_id").in("id", matchIds.slice(offset, offset + 100));
      if (error) throw error;
      matches.push(...(data ?? []));
    }

    const collectorsById = new Map(collectors.map((collector) => [collector.id, collector]));
    const matchesById = new Map(matches.map((match) => [match.id, match]));
    const updates: DistributionStatusUpdate[] = rows.flatMap((assignment) => {
      const collector = collectorsById.get(assignment.collector_id);
      const match = matchesById.get(assignment.match_id);
      if (!collector?.hr_code || !match?.external_id) return [];
      return [{
        matchId: match.external_id,
        collectorHrCode: collector.hr_code,
        task: assignment.raw_task_value ?? assignment.task,
        half: assignment.half,
        status: "Complete" as const,
      }];
    });

    try {
      await updateDistributionStatuses(updates);
      return null;
    } catch (batchError) {
      console.warn("Bulk Distribution status batch failed; retrying only affected assignments individually.", batchError);
    }

    const failures: Array<{ update: DistributionStatusUpdate; reason: string }> = [];
    let synced = 0;
    for (const update of updates) {
      try {
        const result = await updateDistributionStatuses([update]);
        synced += result.updated;
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Unknown Google Sheets error";
        failures.push({ update, reason });
        console.error("Could not sync one completed assignment to Distribution sheet", {
          matchId: update.matchId,
          collectorHrCode: update.collectorHrCode,
          task: update.task,
          half: update.half,
          reason,
        });
      }
    }

    if (failures.length === 0) return null;
    const firstFailure = failures[0];
    const detail = firstFailure
      ? ` First failed row: Match ID ${firstFailure.update.matchId}, HR ${firstFailure.update.collectorHrCode}, task ${firstFailure.update.task}, ${firstFailure.update.half} — ${firstFailure.reason}`
      : "";
    return `Google Sheets sync partially completed: ${synced} status cell(s) updated; ${failures.length} assignment(s) could not be matched or updated.${detail}`;
  } catch (error) {
    console.error("Bulk completion succeeded in app but Distribution status sync failed", error);
    const detail = error instanceof Error ? ` ${error.message}` : "";
    return `Assignments were completed in the app, but Google Sheets sync failed.${detail}`;
  }
}

/**
 * Start Work. All authorization and the atomic state transition happen
 * inside the `start_assignment` RPC (security definer, guards
 * `collector_id = auth.uid() AND status = 'Not Started'`) — this action is
 * a thin wrapper that calls it and translates the result for the UI.
 */
export async function startWork(assignmentId: string): Promise<AssignmentActionState> {
  const supabase = createClient();
  const { error } = await supabase.rpc("start_assignment", {
    p_assignment_id: assignmentId,
  });

  if (error) {
    const appError = translateSupabaseError(error);
    return { error: appError.message, errorCode: appError.code };
  }

  const warning = await syncAssignmentStatusToSheet(supabase, assignmentId, "In Progress");
  revalidatePath(`/collector/assignments/${assignmentId}`);
  revalidatePath("/collector");
  return { ...OK, warning };
}

/**
 * Complete Work. Same pattern as startWork — `complete_assignment` guards
 * `collector_id = auth.uid() AND status in ('In Progress', 'Overdue')` atomically.
 */
export async function completeWork(assignmentId: string): Promise<AssignmentActionState> {
  const supabase = createClient();
  const { error } = await supabase.rpc("complete_assignment", {
    p_assignment_id: assignmentId,
  });

  if (error) {
    const appError = translateSupabaseError(error);
    return { error: appError.message, errorCode: appError.code };
  }

  const warning = await syncAssignmentStatusToSheet(supabase, assignmentId, "Complete");
  revalidatePath(`/collector/assignments/${assignmentId}`);
  revalidatePath("/collector");
  return { ...OK, warning };
}

export async function hideAssignmentFromDashboard(assignmentId: string): Promise<AssignmentActionState> {
  const profile = await getProfileOrRedirect();
  if (profile.role !== "admin") {
    return { error: "You're not authorized to do that.", errorCode: "NOT_AUTHORIZED" };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("hide_assignment_from_dashboard", {
    p_assignment_id: assignmentId,
  });

  if (error) {
    const appError = translateSupabaseError(error);
    return { error: appError.message, errorCode: appError.code };
  }

  revalidatePath(`/admin/assignments/${assignmentId}`);
  revalidatePath("/admin");
  return OK;
}

export async function adminMarkAssignmentComplete(assignmentId: string): Promise<AssignmentActionState> {
  const profile = await getProfileOrRedirect();
  if (profile.role !== "admin") {
    return { error: "You're not authorized to do that.", errorCode: "NOT_AUTHORIZED" };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("admin_complete_assignment", {
    p_assignment_id: assignmentId,
  });

  if (error) {
    const appError = translateSupabaseError(error);
    return { error: appError.message, errorCode: appError.code };
  }

  const warning = await syncAssignmentStatusToSheet(supabase, assignmentId, "Complete");
  revalidatePath(`/admin/assignments/${assignmentId}`);
  revalidatePath("/admin");
  revalidatePath(`/collector/assignments/${assignmentId}`);
  revalidatePath("/collector");
  return { ...OK, warning };
}

export interface BulkCompleteAssignmentsResult extends AssignmentActionState {
  completedCount: number;
}

export async function adminCompleteCurrentDistributionAssignments(): Promise<BulkCompleteAssignmentsResult> {
  const profile = await getProfileOrRedirect();
  if (profile.role !== "admin") {
    return { error: "You're not authorized to do that.", errorCode: "NOT_AUTHORIZED", completedCount: 0 };
  }

  const supabase = createClient();
  let assignmentIds: string[];
  try {
    assignmentIds = await fetchCurrentDistributionAssignmentIds(supabase);
  } catch (fetchError) {
    console.error("Could not identify current distribution assignments before bulk completion", fetchError);
    const appError = translateSupabaseError(fetchError);
    return { error: appError.message, errorCode: appError.code, completedCount: 0 };
  }
  const { data, error } = await supabase.rpc("admin_complete_current_distribution_assignments");
  if (error) {
    const appError = translateSupabaseError(error);
    return { error: appError.message, errorCode: appError.code, completedCount: 0 };
  }

  const warning = await syncCurrentDistributionCompletionsToSheet(supabase, assignmentIds);
  revalidatePath("/admin");
  revalidatePath("/collector");
  return { ...OK, warning, completedCount: data };
}

export type ReassignmentMode = "preserve" | "reset";

export async function reassignAssignment(
  assignmentId: string,
  newCollectorId: string,
  mode: ReassignmentMode
): Promise<AssignmentActionState> {
  const supabase = createClient();
  const { error } = await supabase.rpc("reassign_assignment", {
    p_assignment_id: assignmentId,
    p_new_collector_id: newCollectorId,
    p_mode: mode,
  });

  if (error) {
    const appError = translateSupabaseError(error);
    return { error: appError.message, errorCode: appError.code };
  }

  revalidatePath(`/admin/assignments/${assignmentId}`);
  revalidatePath("/admin");
  return OK;
}

/**
 * Update Assignment. Admin-only, updates task, half, SLA, and/or notes.
 * All authorization and validation happen inside the RPC (security definer).
 */
export async function updateAssignment(
  assignmentId: string,
  task: string,
  half: string,
  sla: string,
  notes: string | null
): Promise<AssignmentActionState> {
  const supabase = createClient();
  const { error } = await supabase.rpc("update_assignment", {
    p_assignment_id: assignmentId,
    p_task: task,
    p_half: half,
    p_sla: sla,
    p_notes: notes,
  });

  if (error) {
    const appError = translateSupabaseError(error);
    return { error: appError.message, errorCode: appError.code };
  }

  revalidatePath(`/admin/assignments/${assignmentId}`);
  revalidatePath("/admin");
  return OK;
}

function isValidShiftDate(value: string | null): boolean {
  if (value === null) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isValidOfficialWebsiteUrl(value: string | null): boolean {
  if (value === null) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Update Distribution Details. Admin-only. Updates assignment shift_date
 * and the parent match official_website_url without touching status,
 * timestamps, SLA, identity, or task timers.
 */
export async function updateDistributionDetails(
  assignmentId: string,
  shiftDate: string | null,
  officialWebsiteUrl: string | null
): Promise<AssignmentActionState> {
  const profile = await getProfileOrRedirect();
  if (profile.role !== "admin") {
    return { error: "You're not authorized to do that.", errorCode: "NOT_AUTHORIZED" };
  }

  if (!isValidShiftDate(shiftDate)) {
    return { error: "Shift Date must be a valid date.", errorCode: "INVALID_SHIFT_DATE" };
  }

  if (!isValidOfficialWebsiteUrl(officialWebsiteUrl)) {
    return {
      error: "Official Match URL must be a valid http or https address.",
      errorCode: "INVALID_OFFICIAL_WEBSITE_URL",
    };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("update_distribution_details", {
    p_assignment_id: assignmentId,
    p_shift_date: shiftDate,
    p_official_website_url: officialWebsiteUrl,
  });

  if (error) {
    const appError = translateSupabaseError(error);
    return { error: appError.message, errorCode: appError.code };
  }

  revalidatePath(`/admin/assignments/${assignmentId}`);
  revalidatePath(`/collector/assignments/${assignmentId}`);
  revalidatePath("/admin");
  revalidatePath("/collector");
  return OK;
}

function revalidateAssignmentPaths(assignmentId: string) {
  revalidatePath(`/collector/assignments/${assignmentId}`);
  revalidatePath(`/admin/assignments/${assignmentId}`);
  revalidatePath("/collector");
  revalidatePath("/admin");
}

export async function startAssignmentTask(
  assignmentId: string,
  taskName: string
): Promise<AssignmentActionState> {
  if (!isAssignmentTaskName(taskName)) {
    return { error: "That task is not allowed.", errorCode: "INVALID_TASK_NAME" };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("start_assignment_task", {
    p_assignment_id: assignmentId,
    p_task_name: taskName,
  });

  if (error) {
    const appError = translateSupabaseError(error);
    return { error: appError.message, errorCode: appError.code };
  }

  revalidateAssignmentPaths(assignmentId);
  return OK;
}

export async function endAssignmentTask(
  assignmentId: string,
  taskName: string
): Promise<AssignmentActionState> {
  if (!isAssignmentTaskName(taskName)) {
    return { error: "That task is not allowed.", errorCode: "INVALID_TASK_NAME" };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("end_assignment_task", {
    p_assignment_id: assignmentId,
    p_task_name: taskName,
  });

  if (error) {
    const appError = translateSupabaseError(error);
    return { error: appError.message, errorCode: appError.code };
  }

  revalidateAssignmentPaths(assignmentId);
  return OK;
}

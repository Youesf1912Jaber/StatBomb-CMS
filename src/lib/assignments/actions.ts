"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import { translateSupabaseError, type AppErrorCode } from "@/lib/errors";
import { isAssignmentTaskName } from "./task-names";

export interface AssignmentActionState {
  error: string | null;
  errorCode: AppErrorCode | null;
}

const OK: AssignmentActionState = { error: null, errorCode: null };

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

  revalidatePath(`/collector/assignments/${assignmentId}`);
  revalidatePath("/collector");
  return OK;
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

  revalidatePath(`/collector/assignments/${assignmentId}`);
  revalidatePath("/collector");
  return OK;
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

  revalidatePath(`/admin/assignments/${assignmentId}`);
  revalidatePath("/admin");
  revalidatePath(`/collector/assignments/${assignmentId}`);
  revalidatePath("/collector");
  return OK;
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

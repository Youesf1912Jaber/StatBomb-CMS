/**
 * Typed application errors. RPCs raise plain-text Postgres exceptions
 * (see the migrations) rather than structured errors — Postgres has no
 * native "error code" concept beyond SQLSTATE, and inventing custom
 * SQLSTATEs is more fragile than matching on the message text we chose
 * ourselves. This module is the single place that knows how to translate
 * a raw PostgrestError into one of these typed codes, so no raw Postgres
 * error text ever reaches the UI.
 */

export type AppErrorCode =
  | "NOT_AUTHENTICATED"
  | "NOT_AUTHORIZED"
  | "ASSIGNMENT_NOT_STARTABLE"
  | "ASSIGNMENT_NOT_COMPLETABLE"
  | "DUPLICATE_LOGICAL_ASSIGNMENT"
  | "INVALID_REASSIGNMENT_MODE"
  | "SAME_COLLECTOR_REASSIGNMENT"
  | "NOT_FOUND"
  | "INVALID_TASK_NAME"
  | "ASSIGNMENT_TASK_NOT_STARTABLE"
  | "TASK_ALREADY_STARTED"
  | "TASK_TIMER_ACTIVE"
  | "TASK_TIMER_NOT_ACTIVE"
  | "ACTIVE_TASK_TIMER"
  | "UNKNOWN";

export class AppError extends Error {
  code: AppErrorCode;
  /** For DUPLICATE_LOGICAL_ASSIGNMENT, the conflicting assignment's id. */
  conflictingId?: string;

  constructor(code: AppErrorCode, message: string, conflictingId?: string) {
    super(message);
    this.code = code;
    this.conflictingId = conflictingId;
  }
}

interface PostgrestLikeError {
  message?: string;
  details?: string | null;
  code?: string;
}

const USER_MESSAGES: Record<AppErrorCode, string> = {
  NOT_AUTHENTICATED: "You need to be signed in to do that.",
  NOT_AUTHORIZED: "You're not authorized to do that.",
  ASSIGNMENT_NOT_STARTABLE:
    "This assignment can't be started — it may already be in progress, completed, or assigned to someone else.",
  ASSIGNMENT_NOT_COMPLETABLE:
    "This assignment can't be completed — it may not be in progress, or is assigned to someone else.",
  DUPLICATE_LOGICAL_ASSIGNMENT:
    "An assignment with this match, task, and half already exists.",
  INVALID_REASSIGNMENT_MODE:
    "Invalid reassignment mode. Must be 'preserve' or 'reset'.",
  SAME_COLLECTOR_REASSIGNMENT:
    "Cannot reassign an assignment to the same collector.",
  NOT_FOUND: "That record couldn't be found.",
  INVALID_TASK_NAME: "That task is not allowed.",
  ASSIGNMENT_TASK_NOT_STARTABLE:
    "This task can't be started — the assignment must already be started and not completed.",
  TASK_ALREADY_STARTED: "This task has already been started and cannot be restarted.",
  TASK_TIMER_ACTIVE: "End the active task before starting another.",
  TASK_TIMER_NOT_ACTIVE: "This task is not running.",
  ACTIVE_TASK_TIMER: "Please end all active tasks before completing the assignment.",
  UNKNOWN: "Something went wrong. Please try again.",
};

/** Translates a Supabase/Postgres error into a typed AppError. */
export function translateSupabaseError(error: PostgrestLikeError | null | undefined): AppError {
  const message = error?.message ?? "";

  if (message.includes("DUPLICATE_LOGICAL_ASSIGNMENT")) {
    return new AppError(
      "DUPLICATE_LOGICAL_ASSIGNMENT",
      USER_MESSAGES.DUPLICATE_LOGICAL_ASSIGNMENT,
      error?.details ?? undefined
    );
  }
  // Backstop in case the unique-constraint violation ever surfaces
  // unwrapped (e.g. a future direct-insert code path bypasses the RPC).
  if (error?.code === "23505") {
    return new AppError("DUPLICATE_LOGICAL_ASSIGNMENT", USER_MESSAGES.DUPLICATE_LOGICAL_ASSIGNMENT);
  }
  if (message.includes("ASSIGNMENT_NOT_STARTABLE")) {
    return new AppError("ASSIGNMENT_NOT_STARTABLE", USER_MESSAGES.ASSIGNMENT_NOT_STARTABLE);
  }
  if (message.includes("ASSIGNMENT_NOT_COMPLETABLE")) {
    return new AppError("ASSIGNMENT_NOT_COMPLETABLE", USER_MESSAGES.ASSIGNMENT_NOT_COMPLETABLE);
  }
  if (message.includes("ACTIVE_TASK_TIMER")) {
    return new AppError("ACTIVE_TASK_TIMER", USER_MESSAGES.ACTIVE_TASK_TIMER);
  }
  if (message.includes("INVALID_TASK_NAME")) {
    return new AppError("INVALID_TASK_NAME", USER_MESSAGES.INVALID_TASK_NAME);
  }
  if (message.includes("ASSIGNMENT_TASK_NOT_STARTABLE")) {
    return new AppError("ASSIGNMENT_TASK_NOT_STARTABLE", USER_MESSAGES.ASSIGNMENT_TASK_NOT_STARTABLE);
  }
  if (message.includes("TASK_ALREADY_STARTED")) {
    return new AppError("TASK_ALREADY_STARTED", USER_MESSAGES.TASK_ALREADY_STARTED);
  }
  if (message.includes("TASK_TIMER_ACTIVE")) {
    return new AppError("TASK_TIMER_ACTIVE", USER_MESSAGES.TASK_TIMER_ACTIVE);
  }
  if (message.includes("TASK_TIMER_NOT_ACTIVE")) {
    return new AppError("TASK_TIMER_NOT_ACTIVE", USER_MESSAGES.TASK_TIMER_NOT_ACTIVE);
  }
  if (message.includes("invalid reassignment mode")) {
    return new AppError("INVALID_REASSIGNMENT_MODE", USER_MESSAGES.INVALID_REASSIGNMENT_MODE);
  }
  if (message.includes("cannot reassign to the same collector")) {
    return new AppError("SAME_COLLECTOR_REASSIGNMENT", USER_MESSAGES.SAME_COLLECTOR_REASSIGNMENT);
  }
  if (message.includes("not authenticated")) {
    return new AppError("NOT_AUTHENTICATED", USER_MESSAGES.NOT_AUTHENTICATED);
  }
  if (message.includes("not authorized")) {
    return new AppError("NOT_AUTHORIZED", USER_MESSAGES.NOT_AUTHORIZED);
  }
  if (message.includes("not found")) {
    return new AppError("NOT_FOUND", USER_MESSAGES.NOT_FOUND);
  }

  return new AppError("UNKNOWN", USER_MESSAGES.UNKNOWN);
}

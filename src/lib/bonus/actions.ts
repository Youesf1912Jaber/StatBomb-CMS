"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import { getAssignmentById } from "@/lib/assignments/queries";
import { PreviewInputError } from "@/lib/sync/preview";
import {
  appendBonusRow,
  updateBonusResolution,
} from "./sheet";
import {
  isBonusReason,
  isBonusResolution,
  isBonusTask,
  type BonusResolution,
} from "./options";

export interface BonusActionState {
  error: string | null;
  success: boolean;
}

const OK: BonusActionState = { error: null, success: true };

function failure(message: string): BonusActionState {
  return { error: message, success: false };
}

function safeMessage(error: unknown, fallback: string): string {
  return error instanceof PreviewInputError ? error.safeMessage : fallback;
}

function revalidateBonusPaths(assignmentId?: string) {
  if (assignmentId) revalidatePath(`/collector/assignments/${assignmentId}`);
  revalidatePath("/collector/bonus");
  revalidatePath("/admin/bonus");
}

/**
 * Collector Bonus submission. Identity (HR-Code, Collector) and match data are
 * resolved server-side from the authenticated profile and the RLS-scoped
 * assignment; nothing identity-related is trusted from the client.
 */
export async function submitBonus(
  assignmentId: string,
  reason: string,
  task: string
): Promise<BonusActionState> {
  const profile = await getProfileOrRedirect();
  if (profile.role !== "collector" && profile.role !== "admin") {
    return failure("You're not authorized to do that.");
  }
  if (!profile.hr_code) {
    return failure("No HR-Code is set on this account, so a Bonus cannot be submitted.");
  }
  if (!isBonusReason(reason)) {
    return failure("Select a valid Bonus reason.");
  }
  if (!isBonusTask(task)) {
    return failure("Select a valid Bonus task.");
  }

  const supabase = createClient();
  const assignment = await getAssignmentById(supabase, assignmentId);
  if (!assignment) {
    return failure("That assignment could not be found.");
  }
  if (assignment.collector_id !== profile.id) {
    return failure("You can only submit a Bonus for your own assignment.");
  }

  try {
    await appendBonusRow({
      hr_code: profile.hr_code,
      collector: profile.full_name ?? profile.email,
      reason,
      task,
      match_id: assignment.match.external_id,
      home_team: assignment.match.home_team,
      away_team: assignment.match.away_team,
      date: assignment.match.match_date,
    });
  } catch (error) {
    return failure(safeMessage(error, "Unable to submit the Bonus."));
  }

  revalidateBonusPaths(assignmentId);
  return OK;
}

export type BonusResolutionInput = {
  rowNumber: number;
  hrCode: string;
  matchId: string;
  reason: string;
  task: string;
  date: string | null;
  resolution: BonusResolution | null;
};

/** Admin-only Resolution update. Writes only the Resolution cell of one row. */
export async function setBonusResolution(input: BonusResolutionInput): Promise<BonusActionState> {
  const profile = await getProfileOrRedirect();
  if (profile.role !== "admin") {
    return failure("You're not authorized to change Resolution.");
  }
  if (!Number.isSafeInteger(input.rowNumber) || input.rowNumber < 2) {
    return failure("That Bonus row is invalid.");
  }
  if (input.resolution !== null && !isBonusResolution(input.resolution)) {
    return failure("Select a valid Resolution.");
  }

  try {
    await updateBonusResolution({
      expected: {
        row_number: input.rowNumber,
        hr_code: input.hrCode,
        match_id: input.matchId,
        reason: input.reason,
        task: input.task,
        date: input.date,
      },
      resolution: input.resolution,
    });
  } catch (error) {
    return failure(safeMessage(error, "Unable to update Resolution."));
  }

  revalidateBonusPaths();
  return OK;
}

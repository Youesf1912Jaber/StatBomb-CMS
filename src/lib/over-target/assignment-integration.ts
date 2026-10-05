import type { OverTargetRow } from "@/types/database.types";
import { formatInCairo } from "@/lib/dates";
import { formatOverTargetWeekDate, parseRequiredOverTargetCount } from "@/lib/over-target/identity";

export type ParsedDistributionOverTarget = {
  overTarget: boolean;
  overTargetCount: number | null;
};

export type DistributionOverTargetParseResult =
  | { ok: true; value: ParsedDistributionOverTarget }
  | { ok: false; error: string };

export type OverTargetCreateInput = {
  assignmentId: string;
  weekDate: unknown;
  count: unknown;
  createdBy?: string | null;
};

export type OverTargetCreateResult =
  | { ok: true; record: OverTargetRow }
  | { ok: false; error: string; code: string };

export type AssignmentOverTargetRequest = {
  assignmentId: string;
  overTarget: boolean;
  overTargetCount: number | null;
};

export type AttachOverTargetsResult = {
  records: OverTargetRow[];
  warnings: string[];
  sheetFailed: boolean;
};

export function parseDistributionOverTargetFields(input: {
  overTarget?: unknown;
  overTargetCount?: unknown;
}): DistributionOverTargetParseResult {
  const overTarget = input.overTarget === true;
  if (!overTarget) {
    return { ok: true, value: { overTarget: false, overTargetCount: null } };
  }

  const count = parseRequiredOverTargetCount(input.overTargetCount);
  if (!count.ok) {
    return { ok: false, error: count.error };
  }

  return { ok: true, value: { overTarget: true, overTargetCount: count.value } };
}

export function resolveOverTargetDistributionWeek(now: Date = new Date()): string {
  return formatOverTargetWeekDate(formatInCairo(now));
}

function sheetFailureWarning(assignmentId: string, lastSheetError: string | null): string {
  const detail = lastSheetError ? `: ${lastSheetError}` : ".";
  return `Over Target was saved in the database, but writing the Google Sheet row failed${detail} The Distribution assignment ${assignmentId} was not rolled back. Retry the sheet write from Admin Over Target.`;
}

function createFailureWarning(assignmentId: string, error: string): string {
  return `The Distribution assignment ${assignmentId} was created, but Over Target could not be created: ${error} The assignment was not rolled back.`;
}

export async function attachOverTargetsToAssignments(
  items: AssignmentOverTargetRequest[],
  options: {
    weekDate: string;
    createdBy?: string | null;
    create: (input: OverTargetCreateInput) => Promise<OverTargetCreateResult>;
  }
): Promise<AttachOverTargetsResult> {
  const records: OverTargetRow[] = [];
  const warnings: string[] = [];
  let sheetFailed = false;

  for (const item of items) {
    if (!item.overTarget) continue;

    if (item.overTargetCount == null) {
      warnings.push(createFailureWarning(item.assignmentId, "Count is required and must be an integer from 1 to 4."));
      continue;
    }

    try {
      const result = await options.create({
        assignmentId: item.assignmentId,
        weekDate: options.weekDate,
        count: item.overTargetCount,
        createdBy: options.createdBy ?? null,
      });

      if (!result.ok) {
        if (result.code === "DUPLICATE") {
          continue;
        }
        warnings.push(createFailureWarning(item.assignmentId, result.error));
        continue;
      }

      records.push(result.record);
      if (result.record.sheet_sync_status !== "synced") {
        sheetFailed = true;
        warnings.push(sheetFailureWarning(item.assignmentId, result.record.last_sheet_error));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "an unexpected Over Target error occurred.";
      warnings.push(createFailureWarning(item.assignmentId, message));
    }
  }

  return { records, warnings, sheetFailed };
}

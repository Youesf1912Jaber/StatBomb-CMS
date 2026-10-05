import { createHash } from "crypto";
import { normalizeMatchId } from "@/lib/sync/distribution-identity";

export const OVER_TARGET_APP_SOURCE = "app";
export const OVER_TARGET_SHEET_SOURCE = "google_sheet";

export type OverTargetCanonicalFields = {
  match_id: string;
  week: string;
  hr_code: string;
  team: string;
  collector: string;
  count: string;
  done: string;
};

export type OverTargetSheetSourceRow = {
  source_row_number: number;
  match_id: string;
  week: string;
  hr_code: string;
  team: string;
  collector: string;
  count: string;
  done: string;
};

export type OverTargetOccurrence = {
  source_row_number: number;
  fields: OverTargetCanonicalFields;
  content_fingerprint: string;
  occurrence_ordinal: number;
  source_key: string;
};

export type OverTargetCountParseResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

export type OverTargetSheetWriteOutcome = {
  sheet_sync_status: "synced" | "failed";
  sheet_row_number: number | null;
  sheet_synced_at: string | null;
  last_sheet_error: string | null;
};

export type OverTargetAssignmentLink = {
  assignment_id: string;
  match_id: string;
  match_external_id: string;
  hr_code: string;
};

export function canonicalizeOverTargetText(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u200b-\u200f\u202a-\u202e]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalizeOverTargetHrCode(value: unknown): string {
  return canonicalizeOverTargetText(value).toUpperCase();
}

export function canonicalizeOverTargetMatchId(value: unknown): string {
  return normalizeMatchId(value) ?? canonicalizeOverTargetText(value);
}

export function parseOverTargetWeekDate(raw: unknown): { iso: string | null; raw: string } {
  const text = canonicalizeOverTargetText(raw);
  if (!text) return { iso: null, raw: "" };

  const ymd = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (ymd) {
    return { iso: validIsoDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3])), raw: text };
  }

  const mdy = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (mdy) {
    const month = Number(mdy[1]);
    const day = Number(mdy[2]);
    const yearPart = Number(mdy[3]);
    const year = yearPart < 100 ? yearPart + 2000 : yearPart;
    return { iso: validIsoDate(year, month, day), raw: text };
  }

  return { iso: null, raw: text };
}

export function formatOverTargetWeekDate(isoDate: string): string {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match || !match[1] || !match[2] || !match[3]) return isoDate;
  return `${Number(match[2])}/${Number(match[3])}/${Number(match[1])}`;
}

export function parseRequiredOverTargetCount(value: unknown): OverTargetCountParseResult {
  if (value === null || value === undefined || value === "") {
    return { ok: false, error: "Count is required and must be an integer from 1 to 4." };
  }
  if (typeof value === "boolean") {
    return { ok: false, error: "Count is required and must be an integer from 1 to 4." };
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 1 || value > 4) {
      return { ok: false, error: "Count is required and must be an integer from 1 to 4." };
    }
    return { ok: true, value };
  }
  const text = canonicalizeOverTargetText(value);
  if (!/^[1-4]$/.test(text)) {
    return { ok: false, error: "Count is required and must be an integer from 1 to 4." };
  }
  return { ok: true, value: Number(text) };
}

export function parseImportedOverTargetCount(raw: unknown): { value: number | null; raw: string } {
  const text = canonicalizeOverTargetText(raw);
  if (!text) return { value: null, raw: "" };
  const required = parseRequiredOverTargetCount(text);
  return { value: required.ok ? required.value : null, raw: text };
}

export function parseOverTargetDone(raw: unknown): { value: boolean | null; raw: string } {
  const text = canonicalizeOverTargetText(raw);
  if (!text) return { value: null, raw: "" };
  const key = text.toLowerCase();
  if (key === "true" || key === "yes" || key === "y" || key === "1") {
    return { value: true, raw: text };
  }
  if (key === "false" || key === "no" || key === "n" || key === "0") {
    return { value: false, raw: text };
  }
  return { value: null, raw: text };
}

export function canonicalizeOverTargetSource(row: OverTargetSheetSourceRow): OverTargetCanonicalFields {
  return {
    match_id: canonicalizeOverTargetMatchId(row.match_id),
    week: canonicalizeOverTargetText(row.week),
    hr_code: canonicalizeOverTargetHrCode(row.hr_code),
    team: canonicalizeOverTargetText(row.team),
    collector: canonicalizeOverTargetText(row.collector),
    count: canonicalizeOverTargetText(row.count),
    done: canonicalizeOverTargetText(row.done),
  };
}

export function canonicalFieldsFromApp(input: {
  matchExternalId: string;
  weekRaw: string;
  hrCode: string;
  team: string;
  collector: string;
  count: number;
}): OverTargetCanonicalFields {
  return {
    match_id: canonicalizeOverTargetMatchId(input.matchExternalId),
    week: canonicalizeOverTargetText(input.weekRaw),
    hr_code: canonicalizeOverTargetHrCode(input.hrCode),
    team: canonicalizeOverTargetText(input.team),
    collector: canonicalizeOverTargetText(input.collector),
    count: String(input.count),
    done: "",
  };
}

export function overTargetContentFingerprint(fields: OverTargetCanonicalFields): string {
  const payload = [
    fields.match_id,
    fields.week,
    fields.hr_code,
    fields.team,
    fields.collector,
    fields.count,
    fields.done,
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

export function overTargetAppSourceKey(assignmentId: string): string {
  return `app:assignment:${assignmentId}`;
}

export function overTargetSheetSourceKey(contentFingerprint: string, occurrenceOrdinal: number): string {
  return `${contentFingerprint}:${occurrenceOrdinal}`;
}

export function buildOverTargetOccurrences(rows: OverTargetSheetSourceRow[]): OverTargetOccurrence[] {
  const ordinalByFingerprint = new Map<string, number>();
  return rows.map((row) => {
    const fields = canonicalizeOverTargetSource(row);
    const contentFingerprint = overTargetContentFingerprint(fields);
    const occurrenceOrdinal = (ordinalByFingerprint.get(contentFingerprint) ?? 0) + 1;
    ordinalByFingerprint.set(contentFingerprint, occurrenceOrdinal);
    return {
      source_row_number: row.source_row_number,
      fields,
      content_fingerprint: contentFingerprint,
      occurrence_ordinal: occurrenceOrdinal,
      source_key: overTargetSheetSourceKey(contentFingerprint, occurrenceOrdinal),
    };
  });
}

export function findExistingOverTargetForAssignment<T extends { assignment_id: string | null }>(
  rows: T[],
  assignmentId: string
): T | null {
  return rows.find((row) => row.assignment_id === assignmentId) ?? null;
}

export function sheetWriteOutcome(
  success: boolean,
  sheetRowNumber: number | null,
  errorMessage: string | null,
  now: string
): OverTargetSheetWriteOutcome {
  if (success && sheetRowNumber != null) {
    return {
      sheet_sync_status: "synced",
      sheet_row_number: sheetRowNumber,
      sheet_synced_at: now,
      last_sheet_error: null,
    };
  }
  return {
    sheet_sync_status: "failed",
    sheet_row_number: null,
    sheet_synced_at: null,
    last_sheet_error: errorMessage || "Unable to write Over Target to Google Sheets.",
  };
}

export function isRetryableAppOverTargetRow(row: {
  source: string;
  sheet_sync_status: string;
}): boolean {
  return row.source === OVER_TARGET_APP_SOURCE && (row.sheet_sync_status === "pending" || row.sheet_sync_status === "failed");
}

export function shouldPreserveAppOverTargetRow(row: {
  source: string;
  sheet_sync_status: string;
}): boolean {
  return row.source === OVER_TARGET_APP_SOURCE;
}

export function resolveImportedAssignmentId(
  matchExternalId: string,
  hrCode: string,
  assignments: OverTargetAssignmentLink[],
  takenAssignmentIds: Set<string>
): string | null {
  const matchId = canonicalizeOverTargetMatchId(matchExternalId);
  const code = canonicalizeOverTargetHrCode(hrCode);
  if (!matchId || !code) return null;
  const matches = assignments.filter((assignment) => {
    return (
      canonicalizeOverTargetMatchId(assignment.match_external_id) === matchId &&
      canonicalizeOverTargetHrCode(assignment.hr_code) === code &&
      !takenAssignmentIds.has(assignment.assignment_id)
    );
  });
  if (matches.length !== 1) return null;
  return matches[0]?.assignment_id ?? null;
}

export type OverTargetExistingRow = {
  id: string;
  assignment_id: string | null;
  source: string;
  source_key: string;
  sheet_sync_status: string;
  source_present: boolean;
  sheet_row_number?: number | null;
};

export type OverTargetHistoricalImportPlan = {
  inserts: Array<{ occurrence: OverTargetOccurrence; assignment_id: string | null }>;
  matchedIds: string[];
  missingIds: string[];
  preservedAppIds: string[];
};

export function planOverTargetHistoricalImport(
  occurrences: OverTargetOccurrence[],
  existing: OverTargetExistingRow[],
  assignments: OverTargetAssignmentLink[]
): OverTargetHistoricalImportPlan {
  const existingByKey = new Map(existing.map((row) => [row.source_key, row]));
  const existingBySheetRow = new Map(
    existing
      .filter((row) => row.sheet_row_number != null)
      .map((row) => [row.sheet_row_number as number, row])
  );
  const matchedIds: string[] = [];
  const leftoverOccurrences: OverTargetOccurrence[] = [];

  for (const occurrence of occurrences) {
    const match = existingByKey.get(occurrence.source_key) ?? existingBySheetRow.get(occurrence.source_row_number);
    if (match) {
      matchedIds.push(match.id);
    } else {
      leftoverOccurrences.push(occurrence);
    }
  }

  const matchedIdSet = new Set(matchedIds);
  const leftoverExisting = existing.filter((row) => !matchedIdSet.has(row.id));
  const preservedAppIds = leftoverExisting
    .filter((row) => shouldPreserveAppOverTargetRow(row))
    .map((row) => row.id);
  const preservedAppIdSet = new Set(preservedAppIds);
  const missingIds = leftoverExisting
    .filter((row) => row.source_present && !preservedAppIdSet.has(row.id))
    .map((row) => row.id);

  const takenAssignmentIds = new Set(
    existing
      .filter((row) => row.assignment_id)
      .map((row) => row.assignment_id as string)
  );

  const inserts = leftoverOccurrences.map((occurrence) => {
    const assignmentId = resolveImportedAssignmentId(
      occurrence.fields.match_id,
      occurrence.fields.hr_code,
      assignments,
      takenAssignmentIds
    );
    if (assignmentId) takenAssignmentIds.add(assignmentId);
    return { occurrence, assignment_id: assignmentId };
  });

  return { inserts, matchedIds, missingIds, preservedAppIds };
}

function validIsoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

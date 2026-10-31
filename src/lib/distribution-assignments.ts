import "server-only";

import { parseCalendarDate } from "@/lib/dates";
import type { DistributionMatchRow } from "@/lib/sync/google-sheets";
import { normalizeDistributionCollectorHrCode, normalizeDistributionHalf, normalizeDistributionTask, normalizeMatchId } from "@/lib/sync/google-sheets";
import { findAssignmentByLogicalKey } from "@/lib/sync/reconcile";
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
  existing: AssignmentRow | null;
};

export type DistributionAssignmentPlanResult =
  | { ok: true; plan: DistributionAssignmentPlan }
  | { ok: false; reason: string; conflict: boolean };

type ParsedCivilDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function cairoCivilTimeToIso(parts: ParsedCivilDateTime): string | null {
  const wallClockUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
  });
  const partsByType = Object.fromEntries(formatter.formatToParts(new Date(wallClockUtc)).map((part) => [part.type, part.value]));
  const representedUtc = Date.UTC(
    Number(partsByType.year), Number(partsByType.month) - 1, Number(partsByType.day),
    Number(partsByType.hour), Number(partsByType.minute), Number(partsByType.second),
  );
  const offsetMs = representedUtc - wallClockUtc;
  const instant = new Date(wallClockUtc - offsetMs);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

function pad(value: number, size = 2): string {
  return value.toString().padStart(size, "0");
}

function isValidCivilDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function parseTimeParts(value: string): { hour: number; minute: number; second: number } | null {
  const match = value.trim().match(/^(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?(?:\s*([AaPp][Mm]))?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  const meridiem = match[4]?.toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59 || second > 59) return null;
  return { hour, minute, second };
}

function fromCivil(parts: ParsedCivilDateTime): string | null {
  if (
    !Number.isInteger(parts.year) ||
    !Number.isInteger(parts.month) ||
    !Number.isInteger(parts.day) ||
    !Number.isInteger(parts.hour) ||
    !Number.isInteger(parts.minute) ||
    !Number.isInteger(parts.second)
  ) {
    return null;
  }
  if (
    parts.month < 1 ||
    parts.month > 12 ||
    parts.day < 1 ||
    parts.day > 31 ||
    parts.hour < 0 ||
    parts.hour > 23 ||
    parts.minute < 0 ||
    parts.minute > 59 ||
    parts.second < 0 ||
    parts.second > 59 ||
    !isValidCivilDate(parts.year, parts.month, parts.day)
  ) {
    return null;
  }
  return cairoCivilTimeToIso(parts);
}

function parseDistributionDateTime(value: string | null): ParsedCivilDateTime | null {
  const text = value?.replace(/\u00a0/g, " ").trim() ?? "";
  if (!text) return null;

  const iso = text.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i
  );
  if (iso) {
    const parts = {
      year: Number(iso[1]),
      month: Number(iso[2]),
      day: Number(iso[3]),
      hour: Number(iso[4] ?? 0),
      minute: Number(iso[5] ?? 0),
      second: Number(iso[6] ?? 0),
    };
    // Never let an impossible ISO-looking date (for example 2025-18-12)
    // reach PostgreSQL. It is malformed data, not a valid ISO date.
    if (
      !isValidCivilDate(parts.year, parts.month, parts.day) ||
      parts.hour < 0 || parts.hour > 23 ||
      parts.minute < 0 || parts.minute > 59 ||
      parts.second < 0 || parts.second > 59
    ) return null;
    return parts;
  }

  const combined = text.match(
    /^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})(?:[ T,.-]+(\d{1,2}[:.]\d{2}(?:[:.]\d{2})?(?:\s*[AaPp][Mm])?))?$/
  );
  if (!combined) return null;

  const firstToken = combined[1];
  const secondToken = combined[2];
  const thirdToken = combined[3];
  if (!firstToken || !secondToken || !thirdToken) return null;
  const first = Number(firstToken);
  const second = Number(secondToken);
  const third = Number(thirdToken);
  const time = combined[4] ? parseTimeParts(combined[4]) : { hour: 0, minute: 0, second: 0 };
  if (!time) return null;

  if (firstToken.length === 4) {
    return { year: first, month: second, day: third, ...time };
  }
  if (thirdToken.length === 4) {
    // Distribution has both US-style SLA dates (M/D/YYYY) and D/M/YYYY
    // values in older rows. Resolve unambiguous values by bounds; retain MDY
    // for ambiguous values to match the current sheet's normal formatting.
    let month: number;
    let day: number;
    if (first > 12 && second <= 12) {
      day = first;
      month = second;
    } else {
      month = first;
      day = second;
    }
    if (!isValidCivilDate(third, month, day)) return null;
    return { year: third, month, day, ...time };
  }
  return null;
}

export function parseDistributionSla(value: string | null, fallbackDate?: string | null): string | null {
  const text = value?.replace(/\u00a0/g, " ").trim() ?? "";
  if (!text) return null;

  if (/^\d{4}-\d{2}-\d{2}T/.test(text) && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const parsed = parseDistributionDateTime(text);
  if (parsed) return fromCivil(parsed);

  const timeOnly = parseTimeParts(text);
  if (timeOnly) {
    const fallback = parseDistributionDateTime(fallbackDate ?? null);
    if (!fallback) return null;
    return fromCivil({ ...fallback, ...timeOnly });
  }

  return null;
}

function toShiftDate(value: string | null): string | null {
  return parseCalendarDate(value, "dmy");
}

function toSla(value: string | null, fallbackDate?: string | null): string | null {
  return parseDistributionSla(value, fallbackDate);
}

export function isAssignableCollectorTarget(
  profile: Pick<ProfileRow, "role" | "deleted_at" | "suspended_at">,
): boolean {
  return (
    (profile.role === "collector" || profile.role === "admin") &&
    !profile.deleted_at &&
    !profile.suspended_at
  );
}

/**
 * Resolves one operational Distribution row to the immutable database IDs
 * used by create_assignment. Names are display-only; HR-Code is the sole
 * collector identity input.
 */
export type DistributionAssignmentLookupIndexes = {
  matchesByExternalId: Map<string, MatchRow>;
  profilesByHrCode: Map<string, ProfileRow>;
  assignmentsByMatchTaskHalf: Map<string, AssignmentRow[]>;
};

export function planDistributionAssignment(
  row: DistributionMatchRow,
  profiles: ProfileRow[],
  matches: MatchRow[],
  assignments: AssignmentRow[],
  options: { allowExistingCollectorUpdate?: boolean } = {},
  lookupIndexes?: DistributionAssignmentLookupIndexes,
): DistributionAssignmentPlanResult {
  const externalId = normalizeMatchId(row.match_id);
  if (!externalId) return { ok: false, conflict: false, reason: "Distribution row has no valid Match ID." };
  const match = lookupIndexes
    ? lookupIndexes.matchesByExternalId.get(externalId)
    : matches.find((candidate) => normalizeMatchId(candidate.external_id) === externalId);
  if (!match) return { ok: false, conflict: false, reason: "Match ID was not found in Supabase matches." };

  const hrCode = normalizeDistributionCollectorHrCode(row.collector_hr_code);
  const collector = !hrCode
    ? undefined
    : lookupIndexes
      ? lookupIndexes.profilesByHrCode.get(hrCode)
      : profiles.find((candidate) => normalizeDistributionCollectorHrCode(candidate.hr_code) === hrCode);
  if (!collector) return { ok: false, conflict: false, reason: "HR-Code does not resolve to a Supabase profile." };
  if (!isAssignableCollectorTarget(collector)) {
    return { ok: false, conflict: false, reason: "HR-Code does not resolve to an active collector." };
  }

  const task = normalizeDistributionTask(row.task);
  if (!task) return { ok: false, conflict: false, reason: "Distribution task is required." };
  const half = normalizeDistributionHalf(row.half);
  if (!VALID_HALVES.has(half as AssignmentHalf)) {
    return { ok: false, conflict: false, reason: "Distribution half is invalid." };
  }

  const rawSla = row.sla?.trim() ?? "";
  const parsedSla = toSla(row.sla, row.shift_date ?? row.match_date);
  const fallbackShiftDate = toShiftDate(row.shift_date) ?? toShiftDate(row.match_date);
  // SLA is optional metadata in Distribution. A row with a complete assignment
  // identity must still appear on the dashboard when the SLA cell is blank.
  // Use the end of the shift day as a conservative deadline so the assignment
  // does not become overdue immediately; malformed non-empty SLA values remain
  // invalid and are still rejected.
  const fallbackDateParts = fallbackShiftDate
    ? parseDistributionDateTime(fallbackShiftDate)
    : null;
  const fallbackSla = fallbackDateParts
    ? fromCivil({ ...fallbackDateParts, hour: 23, minute: 59, second: 59 })
    : null;
  const sla = parsedSla ?? (!rawSla ? fallbackSla : null);
  if (!sla) return { ok: false, conflict: false, reason: "Distribution SLA must be a valid date/time, or a valid shift/match date when SLA is blank." };

  const identityKey = `${match.id}|${task}|${half}`;
  const indexedCandidates = lookupIndexes?.assignmentsByMatchTaskHalf.get(identityKey);
  const candidateAssignments = lookupIndexes
    ? indexedCandidates ?? []
    : assignments;
  const existing = findAssignmentByLogicalKey(
    candidateAssignments,
    match.id,
    task,
    half,
    collector.id,
    options.allowExistingCollectorUpdate ?? true,
  );
  if (existing && existing.collector_id !== collector.id && !options.allowExistingCollectorUpdate) {
    return {
      ok: false,
      conflict: true,
      reason: "A different collector already owns this Match + Task + Half assignment.",
    };
  }

  return {
    ok: true,
    plan: {
      row,
      collector,
      match,
      task,
      half: half as AssignmentHalf,
      sla,
      shiftDate: toShiftDate(row.shift_date),
      existing: existing ?? null,
    },
  };
}

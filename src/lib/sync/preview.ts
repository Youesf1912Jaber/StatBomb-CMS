import "server-only";

import * as XLSX from "xlsx";
import type {
  AssignmentHalf,
  AssignmentRow,
  Database,
  MatchRow,
  ProfileRow,
  SyncIssueSeverity,
  SyncIssueType,
  SyncRunStatus,
} from "@/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

type Client = SupabaseClient<Database>;

export const PREVIEW_LIMITS = {
  maxFileBytes: 20 * 1024 * 1024,
  maxSheets: 20,
  maxRows: 100_000,
  maxCells: 2_000_000,
  maxFieldLength: 512,
  maxHeaderLength: 128,
} as const;

export class PreviewInputError extends Error {
  constructor(public readonly safeMessage: string) {
    super(safeMessage);
    this.name = "PreviewInputError";
  }
}

export type PreviewOutcome =
  | "would-create"
  | "would-update"
  | "would-reassign"
  | "skip-warning"
  | "skip-error";

export type PreviewIssue = {
  row_number: number;
  severity: SyncIssueSeverity;
  issue_type: SyncIssueType;
  message: string;
};

export type PreviewCandidate = {
  row_number: number;
  outcome: PreviewOutcome;
  external_id: string | null;
  collector_hr_code: string | null;
  collector_name: string | null;
  match_id: string | null;
  assignment_id: string | null;
  raw_task_value: string | null;
  task: string | null;
  half: AssignmentHalf | null;
  sla: string | null;
  shift_date: string | null;
  official_website_url: string | null;
  match_candidate: PreviewMatchCandidate | null;
  issues: PreviewIssue[];
};

export type PreviewMatchCandidate = {
  external_id: string;
  home_team: string;
  away_team: string;
  competition: string | null;
  match_date: string;
  kickoff_time: string | null;
  official_website_url: string | null;
};

export type PreviewSummary = {
  total_rows: number;
  rows_imported: number;
  rows_updated: number;
  rows_reassigned: number;
  rows_skipped: number;
  rows_errored: number;
  issue_counts: {
    warning: number;
    error: number;
  };
  issue_type_counts: Partial<Record<SyncIssueType, number>>;
  diagnostics: {
    valid_rows: number;
    invalid_rows: number;
    unknown_hr_codes: number;
    admin_hr_codes: number;
    invalid_date_time: number;
    duplicate_logical_keys: number;
    ready_rows: number;
  };
  outcomes: Record<PreviewOutcome, number>;
};

export type PreviewResult = {
  sheets: string[];
  summary: PreviewSummary;
  candidates: PreviewCandidate[];
};

export type PreviewSourceRows = {
  sheetName: string;
  headers: string[];
  rows: unknown[][];
};

type RawRow = Partial<RawRowFields>;

const TASK_ALIASES: Record<string, string> = {
  "all tasks": "all_tasks",
  "base all / extras": "base_all_extras",
  "location all / players all / ff imbact goal location":
    "location_all_players_all_ff_impact_goal_location",
  "base presser / location presser / players presser / ff imbact goal locatio":
    "base_presser_location_presser_players_presser_ff_impact_goal_location",
  "extras / players all / ff impact goal location":
    "extras_players_all_ff_impact_goal_location",
  base: "base_all",
  "base all": "base_all",
  "base-all": "base_all",
  extras: "extras",
  extra: "extras",
  location: "location_all",
  "location all": "location_all",
  "location-all": "location_all",
};

const COMPLETE_SCOPE_TASK_KEYS = new Set([
  "all tasks",
  "base all / extras",
  "location all / players all / ff imbact goal location",
  "base presser / location presser / players presser / ff imbact goal locatio",
  "extras / players all / ff impact goal location",
]);

const FIELD_ALIASES: Record<keyof RawRowFields, string[]> = {
  external_id: [
    "id",
    "match id",
    "match identifier",
    "match external id",
    "external id",
    "game id",
    "event id",
    "match",
  ],
  collector_hr_code: ["hr code", "hr-code", "collector hr code", "collector code", "collector id"],
  collector_name: ["collector", "collector name", "assigned collector", "name"],
  task: ["task", "task type", "work type", "assignment type"],
  half: ["half", "period", "match half"],
  shift_date: ["shift date", "date", "assignment date"],
  time: ["time", "sla", "deadline", "due time", "start time", "kick off time"],
  official_website_url: ["official website", "official website url", "website", "website url", "url"],
  home_team: ["home team"],
  away_team: ["away team"],
  competition: ["competition", "competiton"],
  match_date: ["match date"],
};

type RawRowFields = {
  external_id: unknown;
  collector_hr_code: unknown;
  collector_name: unknown;
  task: unknown;
  half: unknown;
  shift_date: unknown;
  time: unknown;
  official_website_url: unknown;
  home_team: unknown;
  away_team: unknown;
  competition: unknown;
  match_date: unknown;
};

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result ? result : null;
}

function normalizeHeader(value: unknown): string {
  const valueString = asString(value);
  if (!valueString || valueString.length > PREVIEW_LIMITS.maxHeaderLength) return "";
  return valueString.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function isBlankRow(row: unknown[]): boolean {
  return row.every((value) => asString(value) === null);
}

function findHeaderRow(rows: unknown[][]): { index: number; headers: string[] } | null {
  let bestIndex = -1;
  let bestScore = 0;
  let bestHeaders: string[] = [];

  rows.slice(0, 15).forEach((row, index) => {
    const headers = row.map(normalizeHeader);
    const score = Object.values(FIELD_ALIASES).filter((aliases) =>
      aliases.some((alias) => headers.includes(alias))
    ).length;
    if (score >= 2 && score > bestScore) {
      bestIndex = index;
      bestScore = score;
      bestHeaders = headers;
    }
  });

  return bestIndex >= 0 ? { index: bestIndex, headers: bestHeaders } : null;
}

function toRows(sheet: XLSX.WorkSheet): { headerRow: number; rows: RawRow[] } {
  const ref = sheet["!ref"];
  if (!ref) return { headerRow: 0, rows: [] };
  const range = XLSX.utils.decode_range(ref);
  const sheetRows = range.e.r - range.s.r + 1;
  const sheetColumns = range.e.c - range.s.c + 1;
  if (
    sheetRows > PREVIEW_LIMITS.maxRows ||
    sheetRows * sheetColumns > PREVIEW_LIMITS.maxCells
  ) {
    throw new PreviewInputError("The workbook exceeds the allowed row or cell limits.");
  }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });
  const header = findHeaderRow(matrix);
  if (header === null) return { headerRow: 0, rows: [] };

  const rows = matrix
    .slice(header.index + 1)
    .filter((row) => !isBlankRow(row))
    .map((row) => {
      const result = Object.create(null) as RawRow;
      (Object.keys(FIELD_ALIASES) as Array<keyof RawRowFields>).forEach((field) => {
        const index = header.headers.findIndex((headerName) =>
          FIELD_ALIASES[field].includes(headerName)
        );
        if (index >= 0) result[field] = row[index];
      });
      return result;
    });

  return { headerRow: header.index, rows };
}

function normalizeTask(value: unknown): { task: string | null; warning: string | null } {
  const raw = asString(value);
  if (!raw) return { task: null, warning: "Task is required." };
  const normalized = raw
    .toLowerCase()
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ")
    .trim();
  const task = TASK_ALIASES[normalized];
  if (task) {
    return {
      task,
      warning:
        COMPLETE_SCOPE_TASK_KEYS.has(normalized) || task === raw
          ? null
          : `Task value "${raw}" was normalized to "${task}".`,
    };
  }

  if (normalized.includes("/")) {
    const compositeTask = normalized.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (compositeTask) {
      return { task: compositeTask, warning: null };
    }
  }

  return { task: null, warning: `Task value "${raw}" could not be normalized.` };
}

function normalizeHalf(value: unknown): AssignmentHalf | null {
  const raw = asString(value)?.toLowerCase().replace(/\s+/g, " ");
  if (!raw) return "Full Match";
  const map: Record<string, AssignmentHalf> = {
    "1": "Half 1",
    "half 1": "Half 1",
    "h1": "Half 1",
    "2": "Half 2",
    "half 2": "Half 2",
    "h2": "Half 2",
    "3": "Half 3",
    "half 3": "Half 3",
    "h3": "Half 3",
    "4": "Half 4",
    "half 4": "Half 4",
    "h4": "Half 4",
    full: "Full Match",
    "full match": "Full Match",
    "full game": "Full Match",
  };
  return raw && raw in map ? map[raw] ?? null : null;
}

function normalizeDate(value: unknown): string | null {
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return null;
    return `${date.y.toString().padStart(4, "0")}-${date.m.toString().padStart(2, "0")}-${date.d
      .toString()
      .padStart(2, "0")}`;
  }
  const raw = asString(value);
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!iso && !slash) return null;
  let year: number;
  let month: number;
  let day: number;
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else {
    const first = Number(slash?.[1]);
    const second = Number(slash?.[2]);
    year = Number(slash?.[3]);
    if (!Number.isInteger(first) || !Number.isInteger(second)) return null;
    if (first > 12 && second <= 12) {
      day = first;
      month = second;
    } else if (second > 12 && first <= 12) {
      month = first;
      day = second;
    } else if (first <= 12 && second <= 12) {
      day = first;
      month = second;
    } else {
      return null;
    }
  }
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function normalizeTime(value: unknown): string | null {
  if (typeof value === "number") {
    if (value < 0 || value >= 1) return null;
    const totalMinutes = Math.round(value * 24 * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:00`;
  }

  const raw = asString(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? 0);
  const meridiem = match[4]?.toLowerCase();
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

function normalizeUrl(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function parseKickoff(value: unknown): {
  time: string | null;
  embeddedDate: string | null;
} {
  if (typeof value === "string") {
    const raw = value.trim();
    const combined = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})\s*-\s*(\d{1,2}:\d{2})$/);
    if (combined) {
      return {
        time: normalizeTime(combined[4]),
        embeddedDate: normalizeDate(`${combined[3]}-${combined[2]}-${combined[1]}`),
      };
    }
  }
  return { time: normalizeTime(value), embeddedDate: null };
}

function toSla(date: string | null, time: string | null): string | null {
  if (!date || !time) return null;
  return `${date}T${time}+03:00`;
}

function safeRowData(fields: RawRowFields): Record<string, string | null> {
  return {
    external_id: asString(fields.external_id),
    collector_hr_code: asString(fields.collector_hr_code),
    collector_name: asString(fields.collector_name),
    task: asString(fields.task),
    half: asString(fields.half),
    shift_date: asString(fields.shift_date),
    time: asString(fields.time),
    official_website_url: asString(fields.official_website_url),
    home_team: asString(fields.home_team),
    away_team: asString(fields.away_team),
    competition: asString(fields.competition),
    match_date: asString(fields.match_date),
  };
}

function getFields(row: RawRow): RawRowFields {
  return {
    external_id: row.external_id ?? null,
    collector_hr_code: row.collector_hr_code ?? null,
    collector_name: row.collector_name ?? null,
    task: row.task ?? null,
    half: row.half ?? null,
    shift_date: row.shift_date ?? null,
    time: row.time ?? null,
    official_website_url: row.official_website_url ?? null,
    home_team: row.home_team ?? null,
    away_team: row.away_team ?? null,
    competition: row.competition ?? null,
    match_date: row.match_date ?? null,
  };
}

function fieldTooLong(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).length > PREVIEW_LIMITS.maxFieldLength;
}

function safeFields(fields: RawRowFields): RawRowFields {
  const result = Object.create(null) as RawRowFields;
  (Object.keys(fields) as Array<keyof RawRowFields>).forEach((field) => {
    result[field] = fieldTooLong(fields[field]) ? null : fields[field];
  });
  return result;
}

function issue(
  rowNumber: number,
  severity: SyncIssueSeverity,
  issueType: SyncIssueType,
  message: string
): PreviewIssue {
  return { row_number: rowNumber, severity, issue_type: issueType, message };
}

function findCollector(
  fields: RawRowFields,
  profiles: ProfileRow[],
  profilesByHrCode?: Map<string, ProfileRow>,
): { profile: ProfileRow | null; unknown: boolean; admin: boolean } {
  const hrCode = asString(fields.collector_hr_code)?.toLowerCase();
  const name = asString(fields.collector_name)?.toLowerCase();
  if (!hrCode && (!name || name === "#n/a")) return { profile: null, unknown: true, admin: false };
  const matchingProfile = hrCode
    ? profilesByHrCode?.get(hrCode) ?? profiles.find((candidate) => candidate.hr_code?.toLowerCase() === hrCode)
    : undefined;
  const assignable = Boolean(
    matchingProfile &&
    (matchingProfile.role === "collector" || matchingProfile.role === "admin") &&
    !matchingProfile.deleted_at &&
    !matchingProfile.suspended_at
  );
  if (assignable && matchingProfile) return { profile: matchingProfile, unknown: false, admin: false };
  if (matchingProfile?.role === "admin") return { profile: null, unknown: false, admin: true };
  const profile = matchingProfile?.role === "collector"
    ? matchingProfile
    : profiles.find((candidate) => Boolean(
      hrCode && candidate.hr_code?.toLowerCase() === hrCode && candidate.role === "collector"
    ));
  return { profile: profile ?? null, unknown: !profile && !matchingProfile, admin: false };
}

function outcomeFor(
  match: MatchRow | null,
  assignment: AssignmentRow | null,
  collectorId: string | null,
  sla: string | null,
  shiftDate: string | null,
  hasWarning: boolean,
  hasError: boolean
): PreviewOutcome {
  if (hasError) return "skip-error";
  if (hasWarning) return "skip-warning";
  if (!match || !assignment) return "would-create";
  if (collectorId && assignment.collector_id !== collectorId) return "would-reassign";
  if (assignment.sla !== sla || assignment.shift_date !== shiftDate) {
    return "would-update";
  }
  return "would-update";
}

function buildSummary(candidates: PreviewCandidate[], totalRows: number): PreviewSummary {
  const outcomes: Record<PreviewOutcome, number> = {
    "would-create": 0,
    "would-update": 0,
    "would-reassign": 0,
    "skip-warning": 0,
    "skip-error": 0,
  };
  let warning = 0;
  let error = 0;
  const issueTypeCounts: Partial<Record<SyncIssueType, number>> = {};
  candidates.forEach((candidate) => {
    outcomes[candidate.outcome] += 1;
    candidate.issues.forEach((item) => {
      if (item.severity === "warning") warning += 1;
      else error += 1;
      issueTypeCounts[item.issue_type] = (issueTypeCounts[item.issue_type] ?? 0) + 1;
    });
  });
  const invalidRows = candidates.filter((candidate) =>
    candidate.issues.some((item) => item.severity === "error")
  ).length;
  return {
    total_rows: totalRows,
    rows_imported: outcomes["would-create"],
    rows_updated: outcomes["would-update"],
    rows_reassigned: outcomes["would-reassign"],
    rows_skipped: outcomes["skip-warning"],
    rows_errored: outcomes["skip-error"],
    issue_counts: { warning, error },
    issue_type_counts: issueTypeCounts,
    diagnostics: {
      valid_rows: totalRows - invalidRows,
      invalid_rows: invalidRows,
      unknown_hr_codes: issueTypeCounts.unknown_hr_code ?? 0,
      admin_hr_codes: issueTypeCounts.hr_code_belongs_to_admin ?? 0,
      invalid_date_time: issueTypeCounts.invalid_date_time ?? 0,
      duplicate_logical_keys: issueTypeCounts.duplicate_logical_key_conflict ?? 0,
      ready_rows: candidates.filter((candidate) => candidate.issues.length === 0).length,
    },
    outcomes,
  };
}

function normalizedMatchCandidate(
  fields: RawRowFields,
  externalId: string | null,
  kickoffTime: string | null
): PreviewMatchCandidate | null {
  const homeTeam = asString(fields.home_team);
  const awayTeam = asString(fields.away_team);
  const matchDate = normalizeDate(fields.match_date);
  if (!externalId || !homeTeam || !awayTeam || !matchDate) return null;
  return {
    external_id: externalId,
    home_team: homeTeam,
    away_team: awayTeam,
    competition: asString(fields.competition),
    match_date: matchDate,
    kickoff_time: kickoffTime,
    official_website_url: normalizeUrl(fields.official_website_url),
  };
}

export function parsePreviewWorkbook(
  buffer: Buffer,
  context: {
    matches: MatchRow[];
    assignments: AssignmentRow[];
    profiles: ProfileRow[];
  }

): PreviewResult {
  if (buffer.length > PREVIEW_LIMITS.maxFileBytes) {
    throw new PreviewInputError("The uploaded workbook exceeds the allowed file size.");
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      type: "buffer",
      cellDates: false,
      cellFormula: false,
      cellHTML: false,
      cellNF: false,
      cellStyles: false,
      bookFiles: false,
      bookProps: false,
      bookVBA: false,
      dense: true,
    });
  } catch {
    throw new PreviewInputError("The uploaded file is not a valid XLSX workbook.");
  }
  if (workbook.SheetNames.length === 0 || workbook.SheetNames.length > PREVIEW_LIMITS.maxSheets) {
    throw new PreviewInputError("The workbook contains an unsupported number of sheets.");
  }
  const totalCells = workbook.SheetNames.reduce((count, sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet?.["!ref"]) return count;
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    return count + (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1);
  }, 0);
  if (totalCells > PREVIEW_LIMITS.maxCells) {
    throw new PreviewInputError("The workbook exceeds the allowed cell limit.");
  }

  const candidates: PreviewCandidate[] = [];
  const seenKeys = new Set<string>();

  // Index the context once so preview cost grows roughly linearly with rows.
  const matchesByExternalId = new Map(
    context.matches.map((match) => [match.external_id.toLowerCase(), match]),
  );
  const profilesByHrCode = new Map<string, ProfileRow>();
  for (const profile of context.profiles) {
    const code = profile.hr_code?.toLowerCase();
    if (code && !profilesByHrCode.has(code)) profilesByHrCode.set(code, profile);
  }
  const assignmentsByLogicalKey = new Map<string, AssignmentRow>();
  for (const assignment of context.assignments) {
    const key = `${assignment.match_id}|${assignment.task}|${assignment.half}`;
    if (!assignmentsByLogicalKey.has(key)) assignmentsByLogicalKey.set(key, assignment);
  }

  let dataRowNumber = 1;

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;
    const { rows } = toRows(sheet);
    rows.forEach((row) => {
      if (dataRowNumber > PREVIEW_LIMITS.maxRows) {
        throw new PreviewInputError("The workbook contains too many rows.");
      }
      const rowNumber = dataRowNumber++;
      const untrustedFields = getFields(row);
      const fields = safeFields(untrustedFields);
      const rowIssues: PreviewIssue[] = [];
      const rawExternalId = asString(fields.external_id);
      const rawTask = asString(fields.task);
      const rawCollectorName = asString(fields.collector_name);
      const match = rawExternalId
        ? matchesByExternalId.get(rawExternalId.toLowerCase()) ?? null
        : null;
      const { task, warning: taskWarning } = normalizeTask(fields.task);
      const half = normalizeHalf(fields.half);
      const shiftDate = normalizeDate(fields.shift_date);
      const kickoff = parseKickoff(fields.time);
      const time = kickoff.time;
      const sla = toSla(shiftDate, time);
      const website = asString(fields.official_website_url);
      const normalizedWebsite = website ? normalizeUrl(website) : null;
      const matchCandidate = normalizedMatchCandidate(fields, rawExternalId, time);
      const collector = findCollector(fields, context.profiles, profilesByHrCode);
      (Object.keys(fields) as Array<keyof RawRowFields>).forEach((field) => {
        if (fieldTooLong(untrustedFields[field])) {
          rowIssues.push(
            issue(rowNumber, "error", "validation_error", `${field} exceeds the maximum allowed length.`)
          );
        }
      });
      const assignment =
        match && task && half
          ? assignmentsByLogicalKey.get(`${match.id}|${task}|${half}`) ?? null
          : null;

      if (!rawExternalId) rowIssues.push(issue(rowNumber, "error", "validation_error", "Match identifier is required."));
      else if (!match && !matchCandidate) rowIssues.push(issue(rowNumber, "error", "validation_error", "Required match fields are missing or invalid."));
      if (!task) {
        rowIssues.push(issue(rowNumber, "error", "validation_error", taskWarning ?? "Task is required."));
      } else if (taskWarning) {
        rowIssues.push(issue(rowNumber, "warning", "task_normalization_warning", taskWarning));
      }
      if (!half) rowIssues.push(issue(rowNumber, "error", "validation_error", "Half value is invalid."));
      if (!shiftDate || !time || !sla) {
        rowIssues.push(issue(rowNumber, "error", "invalid_date_time", "Date and time must be valid."));
      } else if (kickoff.embeddedDate && kickoff.embeddedDate !== shiftDate) {
        rowIssues.push(issue(rowNumber, "error", "invalid_date_time", "Kick-off date conflicts with Shift Date."));
      }
      if (website && !normalizedWebsite) rowIssues.push(issue(rowNumber, "error", "invalid_url", "Official website URL is invalid."));
      if (collector.admin) {
        rowIssues.push(issue(rowNumber, "error", "hr_code_belongs_to_admin", `HR-Code "${asString(fields.collector_hr_code)}" belongs to an Admin profile and cannot be used as a collector assignment.`));
      } else if (collector.unknown) {
        rowIssues.push(issue(rowNumber, "error", "unknown_hr_code", `Collector "${asString(fields.collector_hr_code) ?? rawCollectorName ?? "unknown"}" was not found.`));
      }

      const logicalKey = rawExternalId && task && half ? `${rawExternalId.toLowerCase()}|${task}|${half}` : null;
      if (logicalKey && seenKeys.has(logicalKey)) {
        rowIssues.push(issue(rowNumber, "error", "duplicate_logical_key_conflict", "The workbook contains a duplicate logical assignment."));
      }
      if (logicalKey) seenKeys.add(logicalKey);

      const hasError = rowIssues.some((item) => item.severity === "error");
      const hasWarning = rowIssues.some((item) => item.severity === "warning");
      const candidate: PreviewCandidate = {
        row_number: rowNumber,
        outcome: outcomeFor(
          match,
          assignment,
          collector.profile?.id ?? null,
          sla,
          shiftDate,
          hasWarning,
          hasError
        ),
        external_id: rawExternalId,
        collector_hr_code: asString(fields.collector_hr_code),
        collector_name: rawCollectorName,
        match_id: match?.id ?? null,
        assignment_id: assignment?.id ?? null,
        raw_task_value: rawTask,
        task,
        half,
        sla,
        shift_date: shiftDate,
        official_website_url: normalizedWebsite,
        match_candidate: matchCandidate,
        issues: rowIssues,
      };
      candidates.push(candidate);
    });
  });

  return {
    sheets: workbook.SheetNames,
    summary: buildSummary(candidates, candidates.length),
    candidates,
  };
}

export function parsePreviewSourceRows(
  source: PreviewSourceRows,
  context: {
    matches: MatchRow[];
    assignments: AssignmentRow[];
    profiles: ProfileRow[];
  }
): PreviewResult {
  if (source.rows.length > PREVIEW_LIMITS.maxRows) {
    throw new PreviewInputError("The source contains too many rows.");
  }
  if (source.rows.length * source.headers.length > PREVIEW_LIMITS.maxCells) {
    throw new PreviewInputError("The source exceeds the allowed cell limit.");
  }
  const headers = source.headers.map(normalizeHeader);
  if (!findHeaderRow([headers])) {
    throw new PreviewInputError("The Distribution sheet has no recognized header row.");
  }
  const rows = source.rows.filter((row) => !isBlankRow(row)).map((row) => {
    const result = Object.create(null) as RawRow;
    (Object.keys(FIELD_ALIASES) as Array<keyof RawRowFields>).forEach((field) => {
      const index = headers.findIndex((name) => FIELD_ALIASES[field].includes(name));
      if (index >= 0) result[field] = row[index];
    });
    return result;
  });
  const candidates: PreviewCandidate[] = [];
  const seenKeys = new Set<string>();

  // Build lookup maps once. The old implementation scanned the full matches,
  // assignments, and profiles arrays for every source row (O(rows × DB rows)).
  const matchesByExternalId = new Map(
    context.matches.map((match) => [match.external_id.toLowerCase(), match]),
  );
  const profilesByHrCode = new Map<string, ProfileRow>();
  for (const profile of context.profiles) {
    const code = profile.hr_code?.toLowerCase();
    if (code && !profilesByHrCode.has(code)) profilesByHrCode.set(code, profile);
  }
  const assignmentsByLogicalKey = new Map<string, AssignmentRow>();
  for (const assignment of context.assignments) {
    const key = `${assignment.match_id}|${assignment.task}|${assignment.half}`;
    if (!assignmentsByLogicalKey.has(key)) assignmentsByLogicalKey.set(key, assignment);
  }

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const rawFields = getFields(row);
    const fields = safeFields(rawFields);
    const issues: PreviewIssue[] = [];
    const externalId = asString(fields.external_id);
    const rawTask = asString(fields.task);
    const collectorName = asString(fields.collector_name);
    const match = externalId
      ? matchesByExternalId.get(externalId.toLowerCase()) ?? null
      : null;
    const { task, warning } = normalizeTask(fields.task);
    const half = normalizeHalf(fields.half);
    const shiftDate = normalizeDate(fields.shift_date);
    const kickoff = parseKickoff(fields.time);
    const sla = toSla(shiftDate, kickoff.time);
    const website = asString(fields.official_website_url);
    const normalizedWebsite = website ? normalizeUrl(website) : null;
    const matchCandidate = normalizedMatchCandidate(fields, externalId, kickoff.time);
    const collector = findCollector(fields, context.profiles, profilesByHrCode);
    (Object.keys(fields) as Array<keyof RawRowFields>).forEach((field) => {
      if (fieldTooLong(rawFields[field])) issues.push(issue(rowNumber, "error", "validation_error", `${field} exceeds the maximum allowed length.`));
    });
    const assignment = match && task && half
      ? assignmentsByLogicalKey.get(`${match.id}|${task}|${half}`) ?? null
      : null;
    if (!externalId) issues.push(issue(rowNumber, "error", "validation_error", "Match identifier is required."));
    else if (!match && !matchCandidate) issues.push(issue(rowNumber, "error", "validation_error", "Required match fields are missing or invalid."));
    if (!task) issues.push(issue(rowNumber, "error", "validation_error", warning ?? "Task is required."));
    else if (warning) issues.push(issue(rowNumber, "warning", "task_normalization_warning", warning));
    if (!half) issues.push(issue(rowNumber, "error", "validation_error", "Half value is invalid."));
    if (!shiftDate || !kickoff.time || !sla) {
      issues.push(issue(rowNumber, "error", "invalid_date_time", "Date and time must be valid."));
    } else if (kickoff.embeddedDate && kickoff.embeddedDate !== shiftDate) {
      issues.push(issue(rowNumber, "error", "invalid_date_time", "Kick-off date conflicts with Shift Date."));
    }
    if (website && !normalizedWebsite) issues.push(issue(rowNumber, "error", "invalid_url", "Official website URL is invalid."));
    if (collector.admin) {
      issues.push(issue(rowNumber, "error", "hr_code_belongs_to_admin", `HR-Code "${asString(fields.collector_hr_code)}" belongs to an Admin profile and cannot be used as a collector assignment.`));
    } else if (collector.unknown) {
      issues.push(issue(rowNumber, "error", "unknown_hr_code", `Collector "${asString(fields.collector_hr_code) ?? collectorName ?? "unknown"}" was not found.`));
    }
    const logicalKey = externalId && task && half ? `${externalId.toLowerCase()}|${task}|${half}` : null;
    if (logicalKey && seenKeys.has(logicalKey)) issues.push(issue(rowNumber, "error", "duplicate_logical_key_conflict", "The source contains a duplicate logical assignment."));
    if (logicalKey) seenKeys.add(logicalKey);
    const hasError = issues.some((item) => item.severity === "error");
    const hasWarning = issues.some((item) => item.severity === "warning");
    candidates.push({
      row_number: rowNumber,
      outcome: outcomeFor(match, assignment, collector.profile?.id ?? null, sla, shiftDate, hasWarning, hasError),
      external_id: externalId,
      collector_hr_code: asString(fields.collector_hr_code),
      collector_name: collectorName,
      match_id: match?.id ?? null,
      assignment_id: assignment?.id ?? null,
      raw_task_value: rawTask,
      task,
      half,
      sla,
      shift_date: shiftDate,
      official_website_url: normalizedWebsite,
      match_candidate: matchCandidate,
      issues,
    });
  });
  return { sheets: [source.sheetName], summary: buildSummary(candidates, candidates.length), candidates };
}

export async function loadPreviewContext(client: Client): Promise<{
  matches: MatchRow[];
  assignments: AssignmentRow[];
  profiles: ProfileRow[];
}> {
  // Fetch only the columns used by preview/reconciliation. These tables can be
  // large; transferring notes, timestamps, and unrelated profile data on every
  // sync adds latency without changing any preview decisions.
  const [matches, assignments, profiles] = await Promise.all([
    client.from("matches").select("id,external_id"),
    client.from("assignments").select(
      "id,match_id,collector_id,raw_task_value,task,half,sla,shift_date,distribution_present"
    ),
    client.from("profiles").select("id,hr_code,role,deleted_at,suspended_at").is("deleted_at", null),
  ]);
  if (matches.error) throw new Error("Unable to load matches for preview.");
  if (assignments.error) throw new Error("Unable to load assignments for preview.");
  if (profiles.error) throw new Error("Unable to load collectors for preview.");
  return {
    matches: (matches.data ?? []) as unknown as MatchRow[],
    assignments: (assignments.data ?? []) as unknown as AssignmentRow[],
    profiles: (profiles.data ?? []) as unknown as ProfileRow[],
  };
}

export function toSyncRunMetadata(result: PreviewResult): Record<string, unknown> {
  return {
    preview_outcomes: result.summary.outcomes,
    issue_counts: result.summary.issue_counts,
    preview_candidates: result.candidates,
  };
}

export const PREVIEW_STATUS: SyncRunStatus = "preview";

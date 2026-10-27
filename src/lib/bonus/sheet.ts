import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";

import { googleRequest } from "@/lib/sync/google-sheets";
import { PreviewInputError } from "@/lib/sync/preview";
import type { BonusTask, BonusReason, BonusResolution } from "./options";

const GOOGLE_SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const BONUS_RANGE = "A:AZ";

// How many of the leading rows we are willing to scan looking for the
// header row. The real Bonus sheet currently has headers on row 6 (preceded
// by blank/content rows), but this is intentionally generous so the sheet
// can be reorganized later without breaking the app again.
const MAX_HEADER_SCAN_ROWS = 50;

export type BonusRecord = {
  row_number: number;
  hr_code: string;
  collector: string;
  reason: string;
  task: string;
  match_id: string;
  home_team: string;
  away_team: string;
  date_raw: string;
  date: string | null;
  amount: string | null;
  done: string | null;
  resolution_raw: string;
  resolution: BonusResolution | null;
  comment: string;
};

export type BonusRowIdentity = {
  row_number: number;
  hr_code: string;
  match_id: string;
  reason: string;
  task: string;
  date: string | null;
};

export type BonusSubmissionFields = {
  hr_code: string;
  collector: string;
  reason: BonusReason;
  task: BonusTask;
  match_id: string;
  home_team: string;
  away_team: string;
  date: string;
  comment?: string;
};

type SpreadsheetSheet = { properties?: { sheetId?: number; title?: string } };

type BonusColumnIndexes = {
  hrCode: number;
  collector: number;
  reason: number;
  task: number;
  matchId: number;
  homeTeam: number;
  awayTeam: number;
  date: number;
  amount: number;
  done: number;
  resolution: number;
  comment: number;
};

type LoadedBonusSheet = {
  spreadsheetId: string;
  title: string;
  /** 0-based index within `matrix` of the detected header row. */
  headerRowIndex: number;
  /** 1-based physical spreadsheet row number of the detected header row. */
  headerRowNumber: number;
  matrix: unknown[][];
  headers: string[];
  indexes: BonusColumnIndexes;
};

function requiredSpreadsheetId(): string {
  const value = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  if (!value) throw new PreviewInputError("Google Sheets integration is not configured.");
  return value;
}

function normalizeBonusHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function bonusCellText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function columnLetter(index: number): string {
  let n = index + 1;
  let label = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

/**
 * Formats a submission date exactly like the Bonus Google Sheet: M/D/YYYY.
 * Always uses the Cairo calendar date so server timezone settings cannot shift the day.
 */
export function formatBonusDateForSheet(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    month: "numeric",
    day: "numeric",
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.month}/${values.day}/${values.year}`;
}

/**
 * Parses a Bonus date value from the Google Sheet into ISO 8601 YYYY-MM-DD format.
 *
 * Handles multiple date formats:
 * - ISO 8601: YYYY-MM-DD (e.g., 2026-09-15)
 * - M/D/YYYY format with /, -, or . separator (e.g., 10/3/2026)
 * - Fallback to JavaScript Date.parse() for timestamp-like values
 *
 * Returns null for invalid or empty dates.
 *
 * **IMPORTANT:** Slash dates follow the Google Sheet's MDY convention: the
 * first number is the MONTH and the second is the DAY. Calendar validity is checked.
 */
export function parseBonusDate(raw: string): string | null {
  const text = bonusCellText(raw);
  if (!text) return null;

  // Try ISO 8601 format first: YYYY-MM-DD
  const ymd = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) {
    const year = ymd[1];
    const month = ymd[2];
    const day = ymd[3];
    if (year && month && day) {
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  }

  // The Bonus sheet uses US month/day/year order: M/D/YYYY.
  const mdy = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (mdy) {
    const month = Number(mdy[1]);
    const day = Number(mdy[2]);
    const year = Number(mdy[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      month >= 1 && month <= 12 &&
      day >= 1 && day <= 31 &&
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
    return null;
  }

  // Fallback to JavaScript Date.parse() for other formats
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

function normalizeBonusResolution(raw: string): BonusResolution | null {
  const key = bonusCellText(raw).toLowerCase();
  if (key === "valid") return "Valid";
  if (key === "invalid") return "Invalid";
  return null;
}

async function resolveBonusSheetTitle(spreadsheetId: string): Promise<string> {
  const configuredTitle = (process.env.GOOGLE_SHEETS_BONUS_TAB ?? "Bonus").trim() || "Bonus";
  const gidRaw = process.env.GOOGLE_SHEETS_BONUS_GID?.trim();

  const url = new URL(`${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}`);
  url.searchParams.set("fields", "sheets(properties(sheetId,title))");
  const payload = await googleRequest<{ sheets?: SpreadsheetSheet[] }>(url.toString());
  const sheets = payload.sheets ?? [];

  if (gidRaw) {
    const gid = Number(gidRaw);
    if (!Number.isSafeInteger(gid) || gid < 0) {
      throw new PreviewInputError("Google Sheets tab configuration is invalid.");
    }
    const sheet = sheets.find((item) => item.properties?.sheetId === gid);
    if (!sheet?.properties?.title) {
      throw new PreviewInputError("The configured GOOGLE_SHEETS_BONUS_GID sheet tab was not found.");
    }
    return sheet.properties.title;
  }

  const wanted = configuredTitle.toLowerCase();
  const sheet = sheets.find(
    (item) => (item.properties?.title ?? "").trim().toLowerCase() === wanted
  );
  if (!sheet?.properties?.title) {
    throw new PreviewInputError("The configured GOOGLE_SHEETS_BONUS_TAB sheet tab was not found.");
  }
  return sheet.properties.title;
}

/**
 * Finds the first column index matching any of the given aliases.
 * This is used to match header names in the Bonus sheet headers array.
 * All comparisons are against normalized (lowercase, whitespace-trimmed) headers.
 *
 * @param headers - Array of normalized header strings
 * @param aliases - One or more header name aliases to match against
 * @returns The 0-based column index if found, or -1 if not found
 */
function findColumnIndex(headers: string[], ...aliases: string[]): number {
  for (let i = 0; i < headers.length; i += 1) {
    const header = headers[i];
    if (header && aliases.includes(header)) {
      return i;
    }
  }
  return -1;
}

/**
 * Attempts to resolve Bonus column indexes from a candidate header row.
 * Returns `null` (instead of throwing) when the required headers are not
 * present, so callers can keep scanning subsequent rows for the real header.
 */
function tryResolveIndexes(headers: string[]): BonusColumnIndexes | null {
  const indexes: BonusColumnIndexes = {
    hrCode: findColumnIndex(headers, "hr code", "hrcode", "hr-code", "code", "collector code", "collector hr code"),
    collector: findColumnIndex(headers, "collector", "collector name", "name"),
    reason: findColumnIndex(headers, "reason"),
    task: findColumnIndex(headers, "task"),
    matchId: findColumnIndex(headers, "match id", "matchid", "id"),
    homeTeam: findColumnIndex(headers, "home team", "hometeam", "home"),
    awayTeam: findColumnIndex(headers, "away team", "awayteam", "away"),
    date: findColumnIndex(headers, "date", "bonus date"),
    // "amont" is a real header typo present in the production Bonus sheet
    // (physical column J, row 6). Supported alongside the correctly spelled
    // "amount" / "bonus amount" headers so either spelling resolves.
    amount: findColumnIndex(headers, "amount", "bonus amount", "amont"),
    done: findColumnIndex(headers, "done"),
    resolution: findColumnIndex(headers, "resolution", "resolution status", "review resolution"),
    comment: findColumnIndex(headers, "comment", "comments"),
  };

  // DIAGNOSTIC: Investigate why Resolution writes may not be landing on the
  // expected physical column O. If indexes.resolution is -1 even though a
  // Resolution-like header exists at or near physical column O (0-based
  // index 14), ensureResolutionColumn() will incorrectly create a brand new
  // column instead of reusing the existing one.
  console.log(`[BONUS_RESOLUTION_DIAG] headers.length=${headers.length}`);
  console.log(`[BONUS_RESOLUTION_DIAG] indexes.resolution=${indexes.resolution}`);
  console.log(`[BONUS_RESOLUTION_DIAG] headers[14] (physical column O)=${JSON.stringify(headers[14] ?? 'undefined')}`);
  console.log(`[BONUS_RESOLUTION_DIAG] headers around O: [12]=${JSON.stringify(headers[12] ?? 'undefined')} [13]=${JSON.stringify(headers[13] ?? 'undefined')} [14]=${JSON.stringify(headers[14] ?? 'undefined')} [15]=${JSON.stringify(headers[15] ?? 'undefined')} [16]=${JSON.stringify(headers[16] ?? 'undefined')}`);

  if (
    indexes.hrCode < 0 ||
    indexes.reason < 0 ||
    indexes.task < 0 ||
    indexes.matchId < 0 ||
    indexes.date < 0
  ) {
    return null;
  }
  return indexes;
}

type DetectedBonusHeader = {
  headerRowIndex: number;
  headers: string[];
  indexes: BonusColumnIndexes;
};

/**
 * Scans the leading rows of the Bonus sheet matrix to find the actual header
 * row. The real Bonus sheet does not necessarily have its headers on row 1 —
 * rows above the header may contain unrelated content or be blank. This scans
 * rows (bounded by MAX_HEADER_SCAN_ROWS) until one contains all of the
 * required Bonus headers (HR-Code, Reason, Task, Match ID, Date).
 */
function detectBonusHeaderRow(matrix: unknown[][]): DetectedBonusHeader {
  const scanLimit = Math.min(matrix.length, MAX_HEADER_SCAN_ROWS);
  for (let rowIndex = 0; rowIndex < scanLimit; rowIndex += 1) {
    const candidateRow = matrix[rowIndex] ?? [];
    const headers = candidateRow.map(normalizeBonusHeader);
    const indexes = tryResolveIndexes(headers);
    if (indexes) {
      return { headerRowIndex: rowIndex, headers, indexes };
    }
  }
  throw new PreviewInputError(
    "The Bonus sheet is missing required HR-Code, Reason, Task, Match ID, or Date headers."
  );
}

async function loadBonusSheet(): Promise<LoadedBonusSheet> {
  const spreadsheetId = requiredSpreadsheetId();
  const title = await resolveBonusSheetTitle(spreadsheetId);
  const payload = await googleRequest<{ values?: unknown[][] }>(
    `${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(
      `${title}!${BONUS_RANGE}`
    )}?valueRenderOption=FORMATTED_VALUE`
  );
  const matrix = payload.values ?? [];
  const { headerRowIndex, headers, indexes } = detectBonusHeaderRow(matrix);
  return {
    spreadsheetId,
    title,
    headerRowIndex,
    headerRowNumber: headerRowIndex + 1,
    matrix,
    headers,
    indexes,
  };
}

function rowHasBonusContent(row: unknown[], indexes: BonusColumnIndexes): boolean {
  const candidates = [
    indexes.hrCode,
    indexes.collector,
    indexes.reason,
    indexes.task,
    indexes.matchId,
    indexes.date,
  ];
  return candidates.some((index) => index >= 0 && bonusCellText(row[index]) !== "");
}

function mapBonusRecord(row: unknown[], rowNumber: number, indexes: BonusColumnIndexes): BonusRecord | null {
  if (!rowHasBonusContent(row, indexes)) return null;
  const cell = (column: number): string => (column >= 0 ? bonusCellText(row[column]) : "");
  const dateRaw = cell(indexes.date);
  const resolutionRaw = cell(indexes.resolution);
  return {
    row_number: rowNumber,
    hr_code: cell(indexes.hrCode).toUpperCase(),
    collector: cell(indexes.collector),
    reason: cell(indexes.reason),
    task: cell(indexes.task),
    match_id: cell(indexes.matchId),
    home_team: cell(indexes.homeTeam),
    away_team: cell(indexes.awayTeam),
    date_raw: dateRaw,
    date: parseBonusDate(dateRaw),
    amount: cell(indexes.amount) || null,
    done: cell(indexes.done) || null,
    resolution_raw: resolutionRaw,
    resolution: normalizeBonusResolution(resolutionRaw),
    comment: cell(indexes.comment),
  };
}

function compareBonusDateDesc(a: BonusRecord, b: BonusRecord): number {
  if (a.date && b.date) {
    if (a.date < b.date) return 1;
    if (a.date > b.date) return -1;
    return a.row_number - b.row_number;
  }
  if (a.date) return -1;
  if (b.date) return 1;
  return a.row_number - b.row_number;
}

async function readAllBonusRecords(): Promise<BonusRecord[]> {
  const { matrix, indexes, headerRowIndex } = await loadBonusSheet();
  return matrix
    .slice(headerRowIndex + 1)
    // Physical spreadsheet rows are 1-based; the first data row sits
    // immediately after the detected header row.
    .map((row, index) => mapBonusRecord(row, headerRowIndex + 2 + index, indexes))
    .filter((record): record is BonusRecord => record !== null)
    .sort(compareBonusDateDesc);
}

const getCachedBonusRecords = unstable_cache(
  readAllBonusRecords,
  ["bonus-records-v1"],
  { revalidate: 5, tags: ["bonus-records"] }
);

export async function getAllBonusRecords(): Promise<BonusRecord[]> {
  return getCachedBonusRecords();
}

export async function getBonusRecordsForHrCode(
  hrCode: string | null | undefined
): Promise<BonusRecord[]> {
  const normalized = bonusCellText(hrCode).toUpperCase();
  if (!normalized) return [];
  const records = await getAllBonusRecords();
  return records.filter((record) => record.hr_code === normalized);
}

function findFirstEmptyRow(
  matrix: unknown[][],
  indexes: BonusColumnIndexes,
  headerRowIndex: number
): number {
  let lastContentRow = headerRowIndex + 1;
  for (let index = headerRowIndex + 1; index < matrix.length; index += 1) {
    const row = matrix[index] ?? [];
    if (rowHasBonusContent(row, indexes)) {
      lastContentRow = index + 1;
    }
  }
  return lastContentRow + 1;
}

async function batchUpdateBonusCells(
  spreadsheetId: string,
  data: { range: string; majorDimension: "ROWS"; values: string[][] }[]
): Promise<void> {
  if (data.length === 0) return;
  console.log(`[BONUS_RESOLUTION_DIAG] batchUpdateBonusCells writing data=${JSON.stringify(data)}`);
  try {
    const response = await googleRequest(`${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
    });
    console.log(`[BONUS_RESOLUTION_DIAG] batchUpdateBonusCells response=${JSON.stringify(response)}`);
  } catch (error) {
    console.log(`[BONUS_RESOLUTION_DIAG] batchUpdateBonusCells ERROR=${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

function cellWrite(title: string, row: number, column: number, value: string) {
  const range = `${title}!${columnLetter(column)}${row}`;
  return { range, majorDimension: "ROWS" as const, values: [[value]] };
}

export async function appendBonusRow(fields: BonusSubmissionFields): Promise<void> {
  const { spreadsheetId, title, matrix, indexes, headerRowIndex } = await loadBonusSheet();
  const targetRow = findFirstEmptyRow(matrix, indexes, headerRowIndex);

  const writes = [
    cellWrite(title, targetRow, indexes.hrCode, fields.hr_code),
    cellWrite(title, targetRow, indexes.reason, fields.reason),
    cellWrite(title, targetRow, indexes.task, fields.task),
    cellWrite(title, targetRow, indexes.matchId, fields.match_id),
    cellWrite(title, targetRow, indexes.date, fields.date),
  ];
  if (indexes.collector >= 0) {
    writes.push(cellWrite(title, targetRow, indexes.collector, fields.collector));
  }
  if (indexes.homeTeam >= 0) {
    writes.push(cellWrite(title, targetRow, indexes.homeTeam, fields.home_team));
  }
  if (indexes.awayTeam >= 0) {
    writes.push(cellWrite(title, targetRow, indexes.awayTeam, fields.away_team));
  }
  if (indexes.comment >= 0 && fields.comment?.trim()) {
    writes.push(cellWrite(title, targetRow, indexes.comment, fields.comment.trim()));
  }

  await batchUpdateBonusCells(spreadsheetId, writes);

  const verification = await googleRequest<{ values?: unknown[][] }>(
    `${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(
      `${title}!A${targetRow}:AZ${targetRow}`
    )}?valueRenderOption=FORMATTED_VALUE`
  );
  const written = verification.values?.[0] ?? [];
  const writtenHr = indexes.hrCode >= 0 ? bonusCellText(written[indexes.hrCode]).toUpperCase() : "";
  const writtenMatch = indexes.matchId >= 0 ? bonusCellText(written[indexes.matchId]) : "";
  if (writtenHr !== fields.hr_code.toUpperCase() || writtenMatch !== fields.match_id) {
    throw new PreviewInputError("The Bonus submission could not be verified.");
  }
  revalidateTag("bonus-records");
}

function matchesBonusIdentity(row: unknown[], indexes: BonusColumnIndexes, expected: BonusRowIdentity): boolean {
  const cell = (column: number): string => (column >= 0 ? bonusCellText(row[column]) : "");
  const rowDate = parseBonusDate(cell(indexes.date));
  return (
    cell(indexes.hrCode).toUpperCase() === expected.hr_code.toUpperCase() &&
    cell(indexes.matchId) === expected.match_id &&
    cell(indexes.reason) === expected.reason &&
    cell(indexes.task) === expected.task &&
    rowDate === expected.date
  );
}

async function ensureResolutionColumn(loaded: LoadedBonusSheet): Promise<number> {
  const { spreadsheetId, title, matrix, indexes, headerRowNumber } = loaded;
  console.log(`[BONUS_RESOLUTION_DIAG] ensureResolutionColumn: indexes.resolution=${indexes.resolution}`);
  if (indexes.resolution >= 0) return indexes.resolution;

  let width = 0;
  for (const row of matrix) {
    if (row.length > width) width = row.length;
  }
  const column = Math.max(width, loaded.headers.length);
  console.log(`[BONUS_RESOLUTION_DIAG] ensureResolutionColumn: NO existing Resolution column found; creating NEW column at index=${column} (letter=${columnLetter(column)}) on headerRowNumber=${headerRowNumber}`);
  await batchUpdateBonusCells(spreadsheetId, [cellWrite(title, headerRowNumber, column, "Resolution")]);
  return column;
}

export async function deleteBonusRow(expected: BonusRowIdentity): Promise<void> {
  const loaded = await loadBonusSheet();
  const { spreadsheetId, title, matrix, indexes } = loaded;
  if (!Number.isSafeInteger(expected.row_number) || expected.row_number <= loaded.headerRowNumber) {
    throw new PreviewInputError("That Bonus row is invalid.");
  }

  const row = matrix[expected.row_number - 1];
  if (!row || !matchesBonusIdentity(row, indexes, expected)) {
    throw new PreviewInputError("This Bonus row changed in Google Sheets. Refresh the page and try again.");
  }

  const metadataUrl = new URL(`${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}`);
  metadataUrl.searchParams.set("fields", "sheets(properties(sheetId,title))");
  const metadata = await googleRequest<{ sheets?: SpreadsheetSheet[] }>(metadataUrl.toString());
  const sheet = (metadata.sheets ?? []).find((item) => item.properties?.title === title);
  const sheetId = sheet?.properties?.sheetId;
  if (sheetId === undefined) {
    throw new PreviewInputError("The Bonus sheet tab could not be found.");
  }

  await googleRequest(`${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [{
        deleteDimension: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex: expected.row_number - 1,
            endIndex: expected.row_number,
          },
        },
      }],
    }),
  });
  revalidateTag("bonus-records");
}

export async function updateBonusResolution(input: {
  expected: BonusRowIdentity;
  resolution: BonusResolution | null;
}): Promise<void> {
  const loaded = await loadBonusSheet();
  const { spreadsheetId, title, matrix, indexes } = loaded;
  const resolutionColumn = await ensureResolutionColumn(loaded);

  console.log(`[BONUS_RESOLUTION_DIAG] updateBonusResolution: physicalRowNumber=${input.expected.row_number}, resolutionColumn=${resolutionColumn} (letter=${columnLetter(resolutionColumn)}), targetA1=${title}!${columnLetter(resolutionColumn)}${input.expected.row_number}, valueToWrite=${JSON.stringify(input.resolution ?? "")}`);

  // `row_number` is the 1-based physical spreadsheet row, so index into the
  // matrix (0-based) by subtracting 1 — this is independent of where the
  // header row was detected.
  const row = matrix[input.expected.row_number - 1];
  if (!row || !matchesBonusIdentity(row, indexes, input.expected)) {
    console.log(`[BONUS_RESOLUTION_DIAG] updateBonusResolution: identity match FAILED or row missing. row=${JSON.stringify(row ?? null)}`);
    throw new PreviewInputError(
      "This Bonus row changed in Google Sheets. Refresh the page and try again."
    );
  }

  await batchUpdateBonusCells(spreadsheetId, [
    cellWrite(title, input.expected.row_number, resolutionColumn, input.resolution ?? ""),
  ]);
  revalidateTag("bonus-records");
}

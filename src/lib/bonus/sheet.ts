import "server-only";

import { googleRequest } from "@/lib/sync/google-sheets";
import { PreviewInputError } from "@/lib/sync/preview";
import type { BonusTask, BonusReason, BonusResolution } from "./options";

const GOOGLE_SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const BONUS_RANGE = "A:AZ";

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
};

type LoadedBonusSheet = {
  spreadsheetId: string;
  title: string;
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

export function parseBonusDate(raw: string): string | null {
  const text = bonusCellText(raw);
  if (!text) return null;
  const ymd = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) {
    const year = ymd[1];
    const month = ymd[2];
    const day = ymd[3];
    if (year && month && day) {
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  }
  const dmy = text.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
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

function resolveIndexes(headers: string[]): BonusColumnIndexes {
  const indexFor = (...aliases: string[]) =>
    headers.findIndex((header) => aliases.includes(header));
  const indexes: BonusColumnIndexes = {
    hrCode: indexFor("hr code", "hrcode", "hr-code", "code", "collector code", "collector hr code"),
    collector: indexFor("collector", "collector name", "name"),
    reason: indexFor("reason"),
    task: indexFor("task"),
    matchId: indexFor("match id", "matchid", "id"),
    homeTeam: indexFor("home team", "hometeam", "home"),
    awayTeam: indexFor("away team", "awayteam", "away"),
    date: indexFor("date", "bonus date"),
    amount: indexFor("amount", "bonus amount"),
    done: indexFor("done"),
    resolution: indexFor("resolution", "resolution status", "review resolution"),
  };
  if (
    indexes.hrCode < 0 ||
    indexes.reason < 0 ||
    indexes.task < 0 ||
    indexes.matchId < 0 ||
    indexes.date < 0
  ) {
    throw new PreviewInputError(
      "The Bonus sheet is missing required HR-Code, Reason, Task, Match ID, or Date headers."
    );
  }
  return indexes;
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
  const headers = (matrix[0] ?? []).map(normalizeBonusHeader);
  return { spreadsheetId, title, matrix, headers, indexes: resolveIndexes(headers) };
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

export async function getAllBonusRecords(): Promise<BonusRecord[]> {
  const { matrix, indexes } = await loadBonusSheet();
  return matrix
    .slice(1)
    .map((row, index) => mapBonusRecord(row, index + 2, indexes))
    .filter((record): record is BonusRecord => record !== null)
    .sort(compareBonusDateDesc);
}

export async function getBonusRecordsForHrCode(
  hrCode: string | null | undefined
): Promise<BonusRecord[]> {
  const normalized = bonusCellText(hrCode).toUpperCase();
  if (!normalized) return [];
  const records = await getAllBonusRecords();
  return records.filter((record) => record.hr_code === normalized);
}

function findFirstEmptyRow(matrix: unknown[][], indexes: BonusColumnIndexes): number {
  let lastContentRow = 1;
  for (let index = 1; index < matrix.length; index += 1) {
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
  await googleRequest(`${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
  });
}

function cellWrite(title: string, row: number, column: number, value: string) {
  const range = `${title}!${columnLetter(column)}${row}`;
  return { range, majorDimension: "ROWS" as const, values: [[value]] };
}

export async function appendBonusRow(fields: BonusSubmissionFields): Promise<void> {
  const { spreadsheetId, title, matrix, indexes } = await loadBonusSheet();
  const targetRow = findFirstEmptyRow(matrix, indexes);

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
  const { spreadsheetId, title, matrix, indexes } = loaded;
  if (indexes.resolution >= 0) return indexes.resolution;

  let width = 0;
  for (const row of matrix) {
    if (row.length > width) width = row.length;
  }
  const column = Math.max(width, loaded.headers.length);
  await batchUpdateBonusCells(spreadsheetId, [cellWrite(title, 1, column, "Resolution")]);
  return column;
}

export async function updateBonusResolution(input: {
  expected: BonusRowIdentity;
  resolution: BonusResolution | null;
}): Promise<void> {
  const loaded = await loadBonusSheet();
  const { spreadsheetId, title, matrix, indexes } = loaded;
  const resolutionColumn = await ensureResolutionColumn(loaded);

  const row = matrix[input.expected.row_number - 1];
  if (!row || !matchesBonusIdentity(row, indexes, input.expected)) {
    throw new PreviewInputError(
      "This Bonus row changed in Google Sheets. Refresh the page and try again."
    );
  }

  await batchUpdateBonusCells(spreadsheetId, [
    cellWrite(title, input.expected.row_number, resolutionColumn, input.resolution ?? ""),
  ]);
}

import "server-only";

import { googleRequest } from "@/lib/sync/google-sheets";
import { PreviewInputError } from "@/lib/sync/preview";
import { columnLetter } from "./parse";
import { parseExpectedWeeklyBlocks } from "./parse";
import { isExpectedDailyValue, isExpectedWeekday } from "./options";
import type { ExpectedSheetData, ExpectedWeekBlock, ExpectedWeekday } from "./types";

export type {
  ExpectedCollectorRow,
  ExpectedColumnMap,
  ExpectedSheetCell,
  ExpectedSheetData,
  ExpectedSummaryEntry,
  ExpectedSummaryKey,
  ExpectedWeekBlock,
  ExpectedWeekday,
  ExpectedWeekSummary,
} from "./types";

export { parseExpectedWeeklyBlocks } from "./parse";
export { EXPECTED_DAILY_VALUES, isExpectedDailyValue, isExpectedWeekday } from "./options";

const GOOGLE_SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const EXPECTED_RANGE = "A:AZ";

type SpreadsheetSheet = { properties?: { sheetId?: number; title?: string } };

function requiredSpreadsheetId(): string {
  const value = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  if (!value) throw new PreviewInputError("Google Sheets integration is not configured.");
  return value;
}

function configuredTabTitle(): string {
  return (process.env.GOOGLE_SHEETS_EXPECTED_TAB ?? "Expected").trim() || "Expected";
}

async function listSheets(spreadsheetId: string): Promise<SpreadsheetSheet[]> {
  const url = new URL(`${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}`);
  url.searchParams.set("fields", "sheets(properties(sheetId,title))");
  const payload = await googleRequest<{ sheets?: SpreadsheetSheet[] }>(url.toString());
  return payload.sheets ?? [];
}

async function resolveExpectedSheet(spreadsheetId: string): Promise<{ title: string; sheetId: number }> {
  const sheets = await listSheets(spreadsheetId);
  const configuredTitle = configuredTabTitle();
  const gidRaw = process.env.GOOGLE_SHEETS_EXPECTED_GID?.trim();

  if (gidRaw) {
    const gid = Number(gidRaw);
    if (!Number.isSafeInteger(gid) || gid < 0) {
      throw new PreviewInputError("Google Sheets tab configuration is invalid.");
    }
    const sheet = sheets.find((item) => item.properties?.sheetId === gid);
    const title = sheet?.properties?.title;
    if (!title || sheet?.properties?.sheetId === undefined) {
      throw new PreviewInputError("The configured GOOGLE_SHEETS_EXPECTED_GID sheet tab was not found.");
    }
    if (configuredTitle.toLowerCase() !== title.trim().toLowerCase()) {
      throw new PreviewInputError("The configured GOOGLE_SHEETS_EXPECTED_TAB sheet tab does not match its GID.");
    }
    return { title, sheetId: sheet.properties.sheetId };
  }

  const wanted = configuredTitle.toLowerCase();
  const sheet = sheets.find(
    (item) => (item.properties?.title ?? "").trim().toLowerCase() === wanted
  );
  if (!sheet?.properties?.title || sheet.properties.sheetId === undefined) {
    throw new PreviewInputError("The configured GOOGLE_SHEETS_EXPECTED_TAB sheet tab was not found.");
  }
  return { title: sheet.properties.title, sheetId: sheet.properties.sheetId };
}

export async function readExpectedSheet(): Promise<ExpectedSheetData> {
  const spreadsheetId = requiredSpreadsheetId();
  const sheet = await resolveExpectedSheet(spreadsheetId);
  const payload = await googleRequest<{ values?: unknown[][] }>(
    `${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(
      `${sheet.title}!${EXPECTED_RANGE}`
    )}?valueRenderOption=FORMATTED_VALUE`
  );
  const matrix = payload.values ?? [];
  return {
    spreadsheet_id: spreadsheetId,
    sheet_name: sheet.title,
    sheet_id: sheet.sheetId,
    pulled_at: new Date().toISOString(),
    weeks: parseExpectedWeeklyBlocks(matrix),
  };
}

export type ExpectedDailyUpdateInput = {
  weekId: string;
  hrCode: string;
  day: string;
  value: string;
  rowNumber?: number;
};

function normalizeHrCode(value: string): string {
  return value.trim().toUpperCase();
}

function findWeekById(weeks: ExpectedWeekBlock[], weekId: string): ExpectedWeekBlock | null {
  return weeks.find((week) => {
    const start = week.week_start_date ?? "undated";
    return `${start}-r${week.header_row}` === weekId;
  }) ?? null;
}

export async function updateExpectedDailyValue(
  input: ExpectedDailyUpdateInput
): Promise<ExpectedSheetData> {
  const weekId = input.weekId.trim();
  const hrCode = normalizeHrCode(input.hrCode);
  const day = input.day.trim().toLowerCase();
  const value = input.value.trim();

  if (!weekId) throw new PreviewInputError("Week id is required.");
  if (!hrCode) throw new PreviewInputError("HR-Code is required.");
  if (!isExpectedWeekday(day)) throw new PreviewInputError("A valid weekday is required.");
  if (!isExpectedDailyValue(value)) throw new PreviewInputError("That daily value is not allowed.");

  const before = await readExpectedSheet();
  const week = findWeekById(before.weeks, weekId);
  if (!week) throw new PreviewInputError("Expected week was not found.");

  const matches = week.collectors.filter((row) => normalizeHrCode(row.hr_code.value) === hrCode);
  const collector = input.rowNumber
    ? matches.find((row) => row.row_number === input.rowNumber) ?? null
    : matches[0] ?? null;
  if (!collector) {
    throw new PreviewInputError("This collector row changed in Google Sheets. Refresh and try again.");
  }
  if (collector.row_number < week.start_row || collector.row_number > week.end_row) {
    throw new PreviewInputError("The collector row is outside this Expected week.");
  }

  const target = collector.days[day as ExpectedWeekday];
  if (target.row !== collector.row_number || target.column < 0 || !target.column_letter) {
    throw new PreviewInputError("The Expected day cell could not be resolved.");
  }

  const range = `${before.sheet_name}!${target.column_letter}${target.row}`;
  await googleRequest(`${GOOGLE_SHEETS_API}/${encodeURIComponent(before.spreadsheet_id)}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: "USER_ENTERED",
      data: [{ range, majorDimension: "ROWS", values: [[value]] }],
    }),
  });

  return readExpectedSheet();
}

export function expectedA1(column: number, row: number): string {
  return `${columnLetter(column)}${row}`;
}

import "server-only";

import { googleRequest } from "@/lib/sync/google-sheets";
import { PreviewInputError } from "@/lib/sync/preview";
import { parseExpectedWeeklyBlocks } from "./parse";
import type { ExpectedSheetData } from "./types";

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

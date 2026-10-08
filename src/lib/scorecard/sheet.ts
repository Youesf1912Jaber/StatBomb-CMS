import "server-only";

import { googleRequest } from "@/lib/sync/google-sheets";
import { PreviewInputError } from "@/lib/sync/preview";
import { parseScorecardSheet, ScorecardParseError } from "./parse";
import type { ScorecardSheetData } from "./types";

const GOOGLE_SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

export const SCORECARD_SHEET_TAB = "Scorecard";
export const SCORECARD_SHEET_GID = 1525808006;

type SpreadsheetSheet = {
  properties?: {
    sheetId?: number;
    title?: string;
  };
};

function requiredSpreadsheetId(): string {
  const value = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  if (!value) {
    throw new PreviewInputError("Google Sheets integration is not configured.");
  }
  return value;
}

function configuredTabTitle(): string {
  return (process.env.GOOGLE_SHEETS_SCORECARD_TAB ?? SCORECARD_SHEET_TAB).trim() || SCORECARD_SHEET_TAB;
}

function configuredGid(): number {
  const gid = Number(process.env.GOOGLE_SHEETS_SCORECARD_GID ?? String(SCORECARD_SHEET_GID));
  if (!Number.isSafeInteger(gid) || gid < 0) {
    throw new PreviewInputError("Google Sheets tab configuration is invalid.");
  }
  return gid;
}

function quotedSheetTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

async function resolveScorecardSheet(spreadsheetId: string): Promise<{ title: string; sheetId: number }> {
  const url = new URL(`${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}`);
  url.searchParams.set("fields", "sheets(properties(sheetId,title))");
  const payload = await googleRequest<{ sheets?: SpreadsheetSheet[] }>(url.toString());
  const gid = configuredGid();
  const configuredTitle = configuredTabTitle();

  const sheet = (payload.sheets ?? []).find((item) => item.properties?.sheetId === gid);
  const title = sheet?.properties?.title;
  if (!title || sheet?.properties?.sheetId === undefined) {
    throw new PreviewInputError("The configured GOOGLE_SHEETS_SCORECARD_GID sheet tab was not found.");
  }
  if (configuredTitle.toLowerCase() !== title.trim().toLowerCase()) {
    throw new PreviewInputError("The configured GOOGLE_SHEETS_SCORECARD_TAB sheet tab does not match its GID.");
  }
  return { title, sheetId: sheet.properties.sheetId };
}

export async function readScorecardSheet(): Promise<ScorecardSheetData> {
  const spreadsheetId = requiredSpreadsheetId();
  const sheet = await resolveScorecardSheet(spreadsheetId);
  const payload = await googleRequest<{ values?: unknown[][] }>(
    `${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(
      quotedSheetTitle(sheet.title)
    )}?valueRenderOption=FORMATTED_VALUE`
  );

  try {
    return parseScorecardSheet(payload.values ?? []);
  } catch (error) {
    if (error instanceof ScorecardParseError) {
      throw new PreviewInputError(error.message);
    }
    throw error;
  }
}

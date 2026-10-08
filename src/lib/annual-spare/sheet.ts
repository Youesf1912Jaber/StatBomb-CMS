import "server-only";

import { googleRequest } from "@/lib/sync/google-sheets";
import { PreviewInputError } from "@/lib/sync/preview";
import { parseAnnualSpareSheet, type AnnualSpareRow } from "./parse";

export type { AnnualSpareRow, AnnualSpareSheetInspection } from "./parse";
export {
  inspectAnnualSpareSheet,
  normalizeAnnualSpareHrCode,
  parseAnnualSpareNumber,
  parseAnnualSpareSheet,
} from "./parse";

const GOOGLE_SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const ANNUAL_SPARE_RANGE = "A:Z";

export const ANNUAL_SPARE_SHEET_TAB = "Annual Spare";
export const ANNUAL_SPARE_SHEET_GID = 1684938117;

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
  return (process.env.GOOGLE_SHEETS_ANNUAL_SPARE_TAB ?? ANNUAL_SPARE_SHEET_TAB).trim() || ANNUAL_SPARE_SHEET_TAB;
}

function configuredGid(): number {
  const gid = Number(process.env.GOOGLE_SHEETS_ANNUAL_SPARE_GID ?? String(ANNUAL_SPARE_SHEET_GID));
  if (!Number.isSafeInteger(gid) || gid < 0) {
    throw new PreviewInputError("Google Sheets tab configuration is invalid.");
  }
  return gid;
}

async function resolveAnnualSpareSheet(spreadsheetId: string): Promise<{ title: string; sheetId: number }> {
  const url = new URL(`${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}`);
  url.searchParams.set("fields", "sheets(properties(sheetId,title))");
  const payload = await googleRequest<{ sheets?: SpreadsheetSheet[] }>(url.toString());
  const gid = configuredGid();
  const configuredTitle = configuredTabTitle();

  const sheet = (payload.sheets ?? []).find((item) => item.properties?.sheetId === gid);
  const title = sheet?.properties?.title;
  if (!title || sheet?.properties?.sheetId === undefined) {
    throw new PreviewInputError("The configured GOOGLE_SHEETS_ANNUAL_SPARE_GID sheet tab was not found.");
  }
  if (configuredTitle.toLowerCase() !== title.trim().toLowerCase()) {
    throw new PreviewInputError("The configured GOOGLE_SHEETS_ANNUAL_SPARE_TAB sheet tab does not match its GID.");
  }
  return { title, sheetId: sheet.properties.sheetId };
}

export type AnnualSpareSheetSnapshot = {
  spreadsheetId: string;
  title: string;
  sheetId: number;
  matrix: unknown[][];
};

export async function readAnnualSpareSheetSnapshot(): Promise<AnnualSpareSheetSnapshot> {
  const spreadsheetId = requiredSpreadsheetId();
  const sheet = await resolveAnnualSpareSheet(spreadsheetId);
  const payload = await googleRequest<{ values?: unknown[][] }>(
    `${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(
      `${sheet.title}!${ANNUAL_SPARE_RANGE}`
    )}?valueRenderOption=FORMATTED_VALUE`
  );
  return {
    spreadsheetId,
    title: sheet.title,
    sheetId: sheet.sheetId,
    matrix: payload.values ?? [],
  };
}

export async function readAnnualSpareSheet(): Promise<AnnualSpareRow[]> {
  const snapshot = await readAnnualSpareSheetSnapshot();
  return parseAnnualSpareSheet(snapshot.matrix);
}

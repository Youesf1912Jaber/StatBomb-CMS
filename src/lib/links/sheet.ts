import "server-only";

import { googleRequest } from "@/lib/sync/google-sheets";
import { PreviewInputError } from "@/lib/sync/preview";
import { parseLinksSheet } from "./parse";
import type { LinksSheetData } from "./types";

const GOOGLE_SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

export const LINKS_SHEET_TAB = "Links";
export const LINKS_SHEET_GID = 490955441;
export const LINKS_SPREADSHEET_ID = "1gT8xUWKw-83xIYCXtYXJZU1S4M87JpapM-ROBqF_KgQ";

type SpreadsheetSheet = {
  properties?: {
    sheetId?: number;
    title?: string;
  };
};

function quotedSheetTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

async function resolveLinksSheet(spreadsheetId: string): Promise<{ title: string; sheetId: number }> {
  const url = new URL(`${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}`);
  url.searchParams.set("fields", "sheets(properties(sheetId,title))");
  const payload = await googleRequest<{ sheets?: SpreadsheetSheet[] }>(url.toString());
  const sheet = (payload.sheets ?? []).find((item) => item.properties?.sheetId === LINKS_SHEET_GID);
  const title = sheet?.properties?.title;
  if (!title || sheet?.properties?.sheetId === undefined) {
    throw new PreviewInputError("The Links sheet tab was not found.");
  }
  if (LINKS_SHEET_TAB.toLowerCase() !== title.trim().toLowerCase()) {
    throw new PreviewInputError("The Links sheet tab does not match its GID.");
  }
  return { title, sheetId: sheet.properties.sheetId };
}

export async function readLinksSheet(): Promise<LinksSheetData> {
  const spreadsheetId = LINKS_SPREADSHEET_ID;
  const sheet = await resolveLinksSheet(spreadsheetId);
  const range = quotedSheetTitle(sheet.title);
  const [formatted, formulas] = await Promise.all([
    googleRequest<{ values?: unknown[][] }>(
      `${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`
    ),
    googleRequest<{ values?: unknown[][] }>(
      `${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=FORMULA`
    ),
  ]);
  return parseLinksSheet(formatted.values ?? [], formulas.values ?? []);
}

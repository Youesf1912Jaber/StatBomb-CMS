import "server-only";

import { googleRequest } from "@/lib/sync/google-sheets";
import { PreviewInputError } from "@/lib/sync/preview";
import { matricesFromGridData, parseLinksSheet, type LinksGridCellData } from "./parse";
import type { LinksSheetData } from "./types";

const GOOGLE_SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

export const LINKS_SHEET_TAB = "Links";
export const LINKS_SHEET_GID = 490955441;
export const LINKS_SPREADSHEET_ID = "1gT8xUWKw-83xIYCXtYXJZU1S4M87JpapM-ROBqF_KgQ";

const LINKS_GRID_FIELDS =
  "sheets(properties(sheetId,title),data(rowData(values(formattedValue,userEnteredValue,hyperlink,textFormatRuns(format(link(uri))),userEnteredFormat(textFormat(link(uri))),effectiveFormat(textFormat(link(uri)))))))";

type SpreadsheetSheet = {
  properties?: {
    sheetId?: number;
    title?: string;
  };
  data?: Array<{
    rowData?: Array<{
      values?: LinksGridCellData[];
    }>;
  }>;
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
  const url = new URL(`${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}`);
  url.searchParams.set("includeGridData", "true");
  url.searchParams.set("ranges", quotedSheetTitle(sheet.title));
  url.searchParams.set("fields", LINKS_GRID_FIELDS);
  const payload = await googleRequest<{ sheets?: SpreadsheetSheet[] }>(url.toString());
  const target = (payload.sheets ?? []).find((item) => item.properties?.sheetId === LINKS_SHEET_GID);
  const rowData = target?.data?.[0]?.rowData ?? [];
  const { formatted, formulas, hyperlinks } = matricesFromGridData(rowData);
  return parseLinksSheet(formatted, formulas, hyperlinks);
}

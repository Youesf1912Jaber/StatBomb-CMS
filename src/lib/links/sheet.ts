import "server-only";

import { googleRequest } from "@/lib/sync/google-sheets";
import { PreviewInputError } from "@/lib/sync/preview";
import { matricesFromGridData, parseLinksSheet, type LinksGridCellData } from "./parse";
import type { LinksSheetData } from "./types";

const GOOGLE_SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new PreviewInputError(`Missing required environment variable: ${name}`);
  }
  return value;
}

function requiredSheetGid(name: string): number {
  const raw = requiredEnv(name);
  const gid = Number(raw);
  if (!Number.isSafeInteger(gid) || gid < 0) {
    throw new PreviewInputError(`Environment variable ${name} must be a valid non-negative sheet GID.`);
  }
  return gid;
}

export const LINKS_SHEET_TAB = requiredEnv("GOOGLE_SHEETS_LINKS_TAB");
export const LINKS_SHEET_GID = requiredSheetGid("GOOGLE_SHEETS_LINKS_GID");
export const LINKS_SPREADSHEET_ID = requiredEnv("GOOGLE_SHEETS_LINKS_SPREADSHEET_ID");

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

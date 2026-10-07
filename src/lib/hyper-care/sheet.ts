import "server-only";

import { googleRequest } from "@/lib/sync/google-sheets";
import { PreviewInputError } from "@/lib/sync/preview";
import { parseHyperCareSheet, type HyperCareCatalog } from "./parse";

const GOOGLE_SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const HYPER_CARE_RANGE = "A:AZ";

export const HYPER_CARE_SHEET_TAB = "Hyper Care list";
export const HYPER_CARE_SHEET_GID = 319293263;

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
  return (process.env.GOOGLE_SHEETS_HYPER_CARE_TAB ?? HYPER_CARE_SHEET_TAB).trim() || HYPER_CARE_SHEET_TAB;
}

function configuredGid(): number {
  const gid = Number(process.env.GOOGLE_SHEETS_HYPER_CARE_GID ?? String(HYPER_CARE_SHEET_GID));
  if (!Number.isSafeInteger(gid) || gid < 0) {
    throw new PreviewInputError("Google Sheets tab configuration is invalid.");
  }
  return gid;
}

async function resolveHyperCareSheet(spreadsheetId: string): Promise<{ title: string; sheetId: number }> {
  const url = new URL(`${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}`);
  url.searchParams.set("fields", "sheets(properties(sheetId,title))");
  const payload = await googleRequest<{ sheets?: SpreadsheetSheet[] }>(url.toString());
  const sheets = payload.sheets ?? [];
  const gid = configuredGid();
  const configuredTitle = configuredTabTitle();

  const sheet = sheets.find((item) => item.properties?.sheetId === gid);
  const title = sheet?.properties?.title;
  if (!title || sheet?.properties?.sheetId === undefined) {
    throw new PreviewInputError("The configured GOOGLE_SHEETS_HYPER_CARE_GID sheet tab was not found.");
  }
  if (configuredTitle.toLowerCase() !== title.trim().toLowerCase()) {
    throw new PreviewInputError("The configured GOOGLE_SHEETS_HYPER_CARE_TAB sheet tab does not match its GID.");
  }
  return { title, sheetId: sheet.properties.sheetId };
}

export async function readHyperCareCatalog(): Promise<HyperCareCatalog> {
  const spreadsheetId = requiredSpreadsheetId();
  const sheet = await resolveHyperCareSheet(spreadsheetId);
  const payload = await googleRequest<{ values?: unknown[][] }>(
    `${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(
      `${sheet.title}!${HYPER_CARE_RANGE}`
    )}?valueRenderOption=FORMATTED_VALUE`
  );
  return parseHyperCareSheet(payload.values ?? []);
}

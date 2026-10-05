import "server-only";

import { NextResponse } from "next/server";
import { requireExpectedAdmin } from "@/lib/expected/api";
import { googleRequest } from "@/lib/sync/google-sheets";
import { parseExpectedWeeklyBlocks } from "@/lib/expected/parse";
import { PreviewInputError } from "@/lib/sync/preview";

export const runtime = "nodejs";

const GOOGLE_SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const EXPECTED_RANGE = "A:AZ";

function requiredSpreadsheetId(): string {
  const value = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  if (!value) throw new PreviewInputError("Google Sheets integration is not configured.");
  return value;
}

function configuredTabTitle(): string {
  return (process.env.GOOGLE_SHEETS_EXPECTED_TAB ?? "Expected").trim() || "Expected";
}

type SpreadsheetSheet = { properties?: { sheetId?: number; title?: string } };

async function listSheets(spreadsheetId: string): Promise<SpreadsheetSheet[]> {
  const url = new URL(`${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}`);
  url.searchParams.set("fields", "sheets(properties(sheetId,title))");
  const payload = await googleRequest<{ sheets?: SpreadsheetSheet[] }>(url.toString());
  return payload.sheets ?? [];
}

async function resolveExpectedSheetForDebug(
  spreadsheetId: string
): Promise<{ title: string; sheetId: number }> {
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
      throw new PreviewInputError(
        "The configured GOOGLE_SHEETS_EXPECTED_TAB sheet tab does not match its GID."
      );
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

type DebugResponse = {
  ok: true;
  env: {
    spreadsheetIdConfigured: boolean;
    expectedTabConfigured: boolean;
    expectedGidConfigured: boolean;
    googleCredentialsConfigured: boolean;
  };
  resolvedSheet: {
    title: string;
    gid: number;
  };
  googleRead: {
    rawRowCount: number;
    maxColumns: number;
    firstRows: unknown[][];
    requestedRange: string;
    requestedUrl: string;
  };
  parser: {
    totalWeeks: number;
    weeks: Array<{
      startDate: string | null;
      endDate: string | null;
      shift: string | null;
      collectorCount: number;
    }>;
  };
};

type DebugErrorResponse = {
  ok: false;
  stage: "resolveExpectedSheet" | "readExpectedSheet" | "googleRequest" | "parseExpectedSheet";
  error: string;
  context?: {
    requestedSheetTitle?: string;
    requestedRange?: string;
    requestedUrl?: string;
    rowsReceived?: number;
  };
};

export async function GET(): Promise<NextResponse> {
  const access = await requireExpectedAdmin();
  if (!access.ok) return access.response;

  try {
    const spreadsheetIdConfigured = !!process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
    const expectedTabConfigured = !!process.env.GOOGLE_SHEETS_EXPECTED_TAB?.trim();
    const expectedGidConfigured = !!process.env.GOOGLE_SHEETS_EXPECTED_GID?.trim();
    const googleCredentialsConfigured =
      !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() &&
      !!process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();

    const spreadsheetId = requiredSpreadsheetId();
    let resolvedSheet: { title: string; sheetId: number };
    try {
      resolvedSheet = await resolveExpectedSheetForDebug(spreadsheetId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return NextResponse.json(
        {
          ok: false,
          stage: "resolveExpectedSheet",
          error: errorMessage,
          context: {
            requestedSheetTitle: configuredTabTitle(),
          },
        } as DebugErrorResponse,
        { status: 500 }
      );
    }

    const requestedRange = `${resolvedSheet.title}!${EXPECTED_RANGE}`;
    const requestedUrl = `${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(
      requestedRange
    )}?valueRenderOption=FORMATTED_VALUE`;

    let rawMatrix: unknown[][] = [];
    try {
      const payload = await googleRequest<{ values?: unknown[][] }>(requestedUrl);
      rawMatrix = payload.values ?? [];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return NextResponse.json(
        {
          ok: false,
          stage: "googleRequest",
          error: errorMessage,
          context: {
            requestedSheetTitle: resolvedSheet.title,
            requestedRange,
            requestedUrl: requestedUrl.slice(0, 160),
          },
        } as DebugErrorResponse,
        { status: 500 }
      );
    }

    const rawRowCount = rawMatrix.length;
    let maxColumns = 0;
    for (const row of rawMatrix) {
      if (Array.isArray(row) && row.length > maxColumns) maxColumns = row.length;
    }
    const firstRows = rawMatrix.slice(0, 15);

    let parserResult;
    try {
      parserResult = parseExpectedWeeklyBlocks(rawMatrix);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return NextResponse.json(
        {
          ok: false,
          stage: "parseExpectedSheet",
          error: errorMessage,
          context: {
            requestedSheetTitle: resolvedSheet.title,
            requestedRange,
            rowsReceived: rawRowCount,
          },
        } as DebugErrorResponse,
        { status: 500 }
      );
    }

    const response: DebugResponse = {
      ok: true,
      env: {
        spreadsheetIdConfigured,
        expectedTabConfigured,
        expectedGidConfigured,
        googleCredentialsConfigured,
      },
      resolvedSheet: {
        title: resolvedSheet.title,
        gid: resolvedSheet.sheetId,
      },
      googleRead: {
        rawRowCount,
        maxColumns,
        firstRows,
        requestedRange,
        requestedUrl: requestedUrl.slice(0, 160),
      },
      parser: {
        totalWeeks: parserResult.length,
        weeks: parserResult.slice(0, 10).map((week) => ({
          startDate: week.week_start_date,
          endDate: week.week_end_date,
          shift: week.shift_name,
          collectorCount: week.collectors.length,
        })),
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        ok: false,
        stage: "readExpectedSheet",
        error: errorMessage,
      } as DebugErrorResponse,
      { status: 500 }
    );
  }
}

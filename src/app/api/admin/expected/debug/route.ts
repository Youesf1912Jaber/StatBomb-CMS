import "server-only";

import { NextResponse } from "next/server";
import { requireExpectedAdmin, expectedErrorResponse } from "@/lib/expected/api";
import { readExpectedSheet } from "@/lib/expected/sheet";

export const runtime = "nodejs";

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
    rowCount: number;
    columnCount: number;
    firstRows: unknown[][];
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
  stage: "resolveExpectedSheet" | "readExpectedSheet" | "parseExpectedSheet";
  error: string;
  context?: {
    requestedSheetTitle?: string;
    requestedRange?: string;
    rowsReceived?: number;
  };
};

export async function GET(): Promise<NextResponse<DebugResponse | DebugErrorResponse>> {
  const access = await requireExpectedAdmin();
  if (!access.ok) return access.response;

  try {
    // Check environment configuration
    const spreadsheetIdConfigured = !!process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
    const expectedTabConfigured = !!process.env.GOOGLE_SHEETS_EXPECTED_TAB?.trim();
    const expectedGidConfigured = !!process.env.GOOGLE_SHEETS_EXPECTED_GID?.trim();
    const googleCredentialsConfigured =
      !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() &&
      !!process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();

    // Read the Expected sheet using production path
    const sheet = await readExpectedSheet();

    // Format diagnostic response
    const response: DebugResponse = {
      ok: true,
      env: {
        spreadsheetIdConfigured,
        expectedTabConfigured,
        expectedGidConfigured,
        googleCredentialsConfigured,
      },
      resolvedSheet: {
        title: sheet.sheet_name,
        gid: sheet.sheet_id,
      },
      googleRead: {
        rowCount: 0, // Will be calculated below
        columnCount: 0,
        firstRows: [],
      },
      parser: {
        totalWeeks: sheet.weeks.length,
        weeks: sheet.weeks.slice(0, 10).map((week) => ({
          startDate: week.week_start_date,
          endDate: week.week_end_date,
          shift: week.shift_name,
          collectorCount: week.collectors.length,
        })),
      },
    };

    // Note: We cannot directly access the raw Google Sheets matrix from readExpectedSheet()
    // because it's already been parsed. However, we can infer row count from the parser result.
    // The parser processes the entire matrix, so if weeks exist, data was received.
    // For diagnostic purposes, we report what the parser saw.
    if (sheet.weeks.length > 0) {
      const lastWeek = sheet.weeks[sheet.weeks.length - 1];
      response.googleRead.rowCount = lastWeek?.end_row ?? 0;
      response.googleRead.columnCount = 26; // A:Z is typical
    }

    // Add first 5 rows of raw data from first parsed week if available
    if (sheet.weeks.length > 0) {
      const firstWeek = sheet.weeks[0];
      if (firstWeek) {
        response.googleRead.firstRows.push(
          [
            `Week: ${firstWeek.week_start_date} → ${firstWeek.week_end_date}`,
            `Shift: ${firstWeek.shift_name}`,
            `Header Row: ${firstWeek.header_row}`,
            `Collectors: ${firstWeek.collectors.length}`,
          ],
          firstWeek.collectors.slice(0, 4).map((c) => [
            c.hr_code.value,
            c.collector.value,
            c.type.value,
          ])
        );
      }
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("[DEBUG] Expected sheet read failed:", error);

    // Determine the stage where it failed
    let stage: "resolveExpectedSheet" | "readExpectedSheet" | "parseExpectedSheet" =
      "readExpectedSheet";
    let sanitizedMessage = "An error occurred while reading the Expected sheet.";

    if (error instanceof Error) {
      const msg = error.message;
      if (
        msg.includes("not configured") ||
        msg.includes("sheet tab was not found") ||
        msg.includes("does not match")
      ) {
        stage = "resolveExpectedSheet";
        sanitizedMessage = msg;
      } else {
        sanitizedMessage = msg;
      }
    }

    const errorResponse: DebugErrorResponse = {
      ok: false,
      stage,
      error: sanitizedMessage,
      context: {
        requestedSheetTitle: process.env.GOOGLE_SHEETS_EXPECTED_TAB ?? "Expected",
        requestedRange: "A:AZ",
      },
    };

    return NextResponse.json(errorResponse, { status: 500 });
  }
}

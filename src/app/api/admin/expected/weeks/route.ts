import { NextResponse } from "next/server";
import {
  expectedErrorResponse,
  loadExpectedWeeks,
  requireExpectedAdmin,
  serializeExpectedWeek,
} from "@/lib/expected/api";

export const runtime = "nodejs";

export async function GET() {
  const access = await requireExpectedAdmin();
  if (!access.ok) return access.response;

  try {
    const data = await loadExpectedWeeks();
    return NextResponse.json({
      sheet_name: data.sheet_name,
      pulled_at: data.pulled_at,
      weeks: data.weeks.map(serializeExpectedWeek),
    });
  } catch (error) {
    return expectedErrorResponse(error, "Unable to read Expected weeks.");
  }
}

import { NextResponse } from "next/server";
import {
  expectedErrorResponse,
  filterWeeksForHrCode,
  loadExpectedWeeks,
  requireExpectedCollector,
  serializeExpectedWeek,
} from "@/lib/expected/api";

export const runtime = "nodejs";

export async function GET() {
  const access = await requireExpectedCollector();
  if (!access.ok) return access.response;

  try {
    const data = await loadExpectedWeeks();
    const weeks = filterWeeksForHrCode(data.weeks, access.hr_code).map(serializeExpectedWeek);
    return NextResponse.json({
      sheet_name: data.sheet_name,
      pulled_at: data.pulled_at,
      hr_code: access.hr_code,
      weeks,
    });
  } catch (error) {
    return expectedErrorResponse(error, "Unable to read Expected weeks.");
  }
}

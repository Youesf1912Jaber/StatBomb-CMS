import { NextResponse } from "next/server";
import {
  expectedErrorResponse,
  expectedWeekId,
  loadExpectedWeeks,
  requireExpectedAdmin,
  serializeExpectedWeek,
} from "@/lib/expected/api";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: { weekId: string } }
) {
  const access = await requireExpectedAdmin();
  if (!access.ok) return access.response;

  const weekId = decodeURIComponent(params.weekId ?? "").trim();
  if (!weekId) {
    return NextResponse.json({ error: "Week id is required." }, { status: 400 });
  }

  try {
    const data = await loadExpectedWeeks();
    const week = data.weeks.find((item) => expectedWeekId(item) === weekId);
    if (!week) {
      return NextResponse.json({ error: "Expected week was not found." }, { status: 404 });
    }
    return NextResponse.json({
      sheet_name: data.sheet_name,
      pulled_at: data.pulled_at,
      week: serializeExpectedWeek(week),
    });
  } catch (error) {
    return expectedErrorResponse(error, "Unable to read the Expected week.");
  }
}

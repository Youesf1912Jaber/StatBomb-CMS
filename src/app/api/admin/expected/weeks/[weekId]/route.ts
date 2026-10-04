import { NextResponse } from "next/server";
import {
  expectedErrorResponse,
  expectedWeekId,
  loadExpectedWeeks,
  requireExpectedAdmin,
  serializeExpectedWeek,
} from "@/lib/expected/api";
import { updateExpectedDailyValue } from "@/lib/expected/sheet";

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

export async function PATCH(
  request: Request,
  { params }: { params: { weekId: string } }
) {
  const access = await requireExpectedAdmin();
  if (!access.ok) return access.response;

  const weekId = decodeURIComponent(params.weekId ?? "").trim();
  if (!weekId) {
    return NextResponse.json({ error: "Week id is required." }, { status: 400 });
  }

  let body: {
    hr_code?: unknown;
    day?: unknown;
    value?: unknown;
    row_number?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "A valid JSON body is required." }, { status: 400 });
  }

  const hrCode = typeof body.hr_code === "string" ? body.hr_code : "";
  const day = typeof body.day === "string" ? body.day : "";
  const value = typeof body.value === "string" ? body.value : "";
  const rowNumber = typeof body.row_number === "number" ? body.row_number : undefined;

  try {
    const data = await updateExpectedDailyValue({
      weekId,
      hrCode,
      day,
      value,
      rowNumber,
    });
    const week = data.weeks.find((item) => expectedWeekId(item) === weekId);
    if (!week) {
      return NextResponse.json({ error: "Expected week was not found after saving." }, { status: 404 });
    }
    return NextResponse.json({
      sheet_name: data.sheet_name,
      pulled_at: data.pulled_at,
      week: serializeExpectedWeek(week),
    });
  } catch (error) {
    return expectedErrorResponse(error, "Unable to save the Expected value.");
  }
}

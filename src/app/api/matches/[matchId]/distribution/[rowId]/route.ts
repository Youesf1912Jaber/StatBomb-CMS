import { NextResponse } from "next/server";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import {
  DistributionRowConflictError,
  normalizeMatchId,
  pullTeamSheet,
  updateDistributionRow,
} from "@/lib/sync/google-sheets";
import { PreviewInputError } from "@/lib/sync/preview";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: { matchId: string; rowId: string } },
) {
  try {
    const profile = await getProfileOrRedirect();
    if (profile.role !== "admin") {
      return NextResponse.json({ success: false, error: "Admin access required." }, { status: 403 });
    }

    const matchId = normalizeMatchId(params.matchId);
    const rowNumber = Number(params.rowId);
    if (!matchId || !Number.isSafeInteger(rowNumber) || rowNumber < 2) {
      return NextResponse.json({ success: false, error: "Invalid Distribution row." }, { status: 422 });
    }

    const body = await request.json() as {
      expectedCollectorHrCode?: string;
      expectedTask?: string;
      expectedHalf?: string;
      collectorHrCode?: string;
      task?: string;
      half?: string;
    };
    // Existing Distribution rows may have a collector but missing Task/Half.
    // Allow those blank old values so admins can complete the row without
    // having to change the collector as a workaround.
    if (!body.expectedCollectorHrCode || !body.collectorHrCode || !body.task || !body.half) {
      return NextResponse.json({ success: false, error: "Collector, Task, and Half are required for the saved assignment." }, { status: 422 });
    }

    const roster = await pullTeamSheet();
    const collector = roster.find((candidate) =>
      candidate.hr_code.trim().toUpperCase() === body.collectorHrCode?.trim().toUpperCase()
    );
    if (!collector || !collector.hr_code || !collector.full_name) {
      return NextResponse.json({ success: false, error: "The selected collector is not in the active roster." }, { status: 422 });
    }

    const row = await updateDistributionRow({
      matchId,
      rowNumber,
      expectedCollectorHrCode: body.expectedCollectorHrCode,
      expectedTask: body.expectedTask,
      expectedHalf: body.expectedHalf,
      collectorHrCode: collector.hr_code,
      collectorName: collector.full_name,
      task: body.task,
      half: body.half,
    });
    return NextResponse.json({ success: true, matchId, row });
  } catch (error) {
    const message = error instanceof PreviewInputError
      ? error.safeMessage
      : "The Distribution row could not be updated.";
    const status = error instanceof DistributionRowConflictError ? 409 : error instanceof PreviewInputError ? 422 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

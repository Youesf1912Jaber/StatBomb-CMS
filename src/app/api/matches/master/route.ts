import { NextResponse } from "next/server";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import { readMatchesMasterSheet } from "@/lib/sync/google-sheets";
import { PreviewInputError } from "@/lib/sync/preview";

export const runtime = "nodejs";

export async function GET() {
  try {
    const profile = await getProfileOrRedirect();
    if (profile.role !== "admin") {
      return NextResponse.json({ success: false, error: "Admin access required." }, { status: 403 });
    }
    const matches = await readMatchesMasterSheet();
    return NextResponse.json({ success: true, count: matches.length, matches });
  } catch (error) {
    const message = error instanceof PreviewInputError
      ? error.safeMessage
      : "The Match Master sheet could not be read.";
    const status = error instanceof PreviewInputError ? 422 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

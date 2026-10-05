import { NextResponse } from "next/server";
import { expectedErrorResponse, requireExpectedAdmin } from "@/lib/expected/api";
import { listCachedExpectedWeeks } from "@/lib/expected/queries";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const access = await requireExpectedAdmin();
  if (!access.ok) return access.response;

  try {
    const weeks = await listCachedExpectedWeeks(createClient());
    return NextResponse.json({ weeks });
  } catch (error) {
    return expectedErrorResponse(error, "Unable to read Expected weeks.");
  }
}

import { NextResponse } from "next/server";
import { requireExpectedAdmin, expectedErrorResponse } from "@/lib/expected/api";
import { syncExpectedWeeks } from "@/lib/expected/sync";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST() {
  const access = await requireExpectedAdmin();
  if (!access.ok) return access.response;

  try {
    const result = await syncExpectedWeeks(createServiceRoleClient());
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return expectedErrorResponse(error, "Unable to refresh Expected.");
  }
}

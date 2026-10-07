import { NextResponse } from "next/server";
import { listAnnualSpareBalances } from "@/lib/annual-spare/queries";
import { expectedErrorResponse, requireExpectedAdmin } from "@/lib/expected/api";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const access = await requireExpectedAdmin();
  if (!access.ok) return access.response;

  try {
    const rows = await listAnnualSpareBalances(createClient());
    return NextResponse.json({ rows });
  } catch (error) {
    return expectedErrorResponse(error, "Unable to read Annual Spare balances.");
  }
}

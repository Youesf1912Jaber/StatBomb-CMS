import { NextResponse } from "next/server";
import { getAnnualSpareBalanceForHrCode } from "@/lib/annual-spare/queries";
import { expectedErrorResponse, requireExpectedCollector } from "@/lib/expected/api";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const access = await requireExpectedCollector();
  if (!access.ok) return access.response;

  try {
    const balance = await getAnnualSpareBalanceForHrCode(createClient(), access.hr_code);
    return NextResponse.json({ hr_code: access.hr_code, balance });
  } catch (error) {
    return expectedErrorResponse(error, "Unable to read Annual Spare balance.");
  }
}

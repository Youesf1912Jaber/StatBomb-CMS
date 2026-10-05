import { NextResponse } from "next/server";
import { getOverTargetRecordsForHrCode } from "@/lib/over-target/queries";
import { syncOverTarget } from "@/lib/over-target/sync";
import { PreviewInputError } from "@/lib/sync/preview";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, hr_code")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "collector" && profile?.role !== "admin") {
    return NextResponse.json({ error: "Collector access required." }, { status: 403 });
  }

  try {
    const result = await syncOverTarget(createServiceRoleClient());
    const own = await getOverTargetRecordsForHrCode(supabase, profile.hr_code);
    return NextResponse.json({
      success: true,
      inserted: result.inserted,
      updated: result.updated,
      unchanged: result.unchanged,
      missing: result.missing,
      total: result.total,
      ownCount: own.length,
    });
  } catch (error) {
    console.error("Collector Over Target refresh failed", error);
    const message = error instanceof PreviewInputError ? error.safeMessage : "Unable to refresh Over Target.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

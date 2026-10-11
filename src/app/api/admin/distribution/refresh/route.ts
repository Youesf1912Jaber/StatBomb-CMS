import { NextResponse } from "next/server";
import { DistributionRefreshRpcError, reconcileDistributionAssignments } from "@/lib/sync/reconcile-distribution-assignments";
import { PreviewInputError } from "@/lib/sync/preview";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST() {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      console.error("Distribution refresh authentication lookup failed", authError);
      return NextResponse.json({ error: "Unable to verify your session. Sign in again and retry." }, { status: 401 });
    }
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profileError) {
      console.error("Distribution refresh profile lookup failed", profileError);
      return NextResponse.json({ error: "Unable to verify Admin access." }, { status: 500 });
    }
    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const reconciliation = await reconcileDistributionAssignments(supabase);
    return NextResponse.json({
      success: true,
      present: reconciliation.present,
      missing: reconciliation.missing,
      inserted: reconciliation.inserted,
      updated: reconciliation.updated,
      restored: reconciliation.restored,
      skipped: reconciliation.skipped,
      skippedReasons: reconciliation.skippedReasons,
    });
  } catch (error) {
    console.error("Distribution refresh failed", error);
    const message = error instanceof PreviewInputError
      ? error.safeMessage
      : error instanceof DistributionRefreshRpcError
        ? error.safeMessage
        : "Unable to refresh Distribution. Check the server logs for the underlying error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

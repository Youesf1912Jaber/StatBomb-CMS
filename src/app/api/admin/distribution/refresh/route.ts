import { NextResponse } from "next/server";
import { DistributionRefreshRpcError, reconcileDistributionAssignments } from "@/lib/sync/reconcile-distribution-assignments";
import { PreviewInputError } from "@/lib/sync/preview";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  try {
    const reconciliation = await reconcileDistributionAssignments(supabase);
    return NextResponse.json({
      success: true,
      present: reconciliation.present,
      missing: reconciliation.missing,
      inserted: reconciliation.inserted,
      updated: reconciliation.updated,
      restored: reconciliation.restored,
    });
  } catch (error) {
    console.error("Distribution refresh failed", error);
    const message = error instanceof PreviewInputError
      ? error.safeMessage
      : error instanceof DistributionRefreshRpcError
        ? error.safeMessage
        : "Unable to refresh Distribution.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

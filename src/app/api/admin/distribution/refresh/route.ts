import { NextResponse } from "next/server";
import { fetchAllMatches } from "@/lib/match-master-preview";
import { persistReconciledDistributionPresence } from "@/lib/sync/persist-distribution-presence";
import { readDistributionRowsForPreview } from "@/lib/sync/google-sheets";
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
    const [distributionRows, matches, assignmentsResult] = await Promise.all([
      readDistributionRowsForPreview(),
      fetchAllMatches(supabase),
      supabase.from("assignments").select("*"),
    ]);
    if (assignmentsResult.error) throw assignmentsResult.error;
    const reconciliation = await persistReconciledDistributionPresence(supabase, {
      distributionRows,
      assignments: assignmentsResult.data ?? [],
      matches,
    });
    return NextResponse.json({
      success: true,
      present: reconciliation.presentAssignmentIds.length,
      missing: reconciliation.missingAssignmentIds.length,
    });
  } catch (error) {
    console.error("Distribution refresh failed", error);
    const message = error instanceof PreviewInputError
      ? error.safeMessage
      : "Unable to refresh Distribution.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

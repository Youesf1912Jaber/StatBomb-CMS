import { NextResponse } from "next/server";
import { buildMatchMasterApplyPlan, classifyMatchMasterRows, createMatchMasterPreviewFingerprint } from "@/lib/match-master-preview";
import { readMatchesMasterSheetForPreview } from "@/lib/sync/google-sheets";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  try {
    const [sourceRows, matchesResult] = await Promise.all([
      readMatchesMasterSheetForPreview(),
      supabase.from("matches").select("*"),
    ]);
    if (matchesResult.error) throw matchesResult.error;
    const matches = matchesResult.data ?? [];
    const preview = classifyMatchMasterRows(sourceRows, matches);
    const plan = buildMatchMasterApplyPlan(sourceRows, matches);
    return NextResponse.json({
      ...preview,
      fingerprint: createMatchMasterPreviewFingerprint(sourceRows, matches),
      apply: {
        candidates: plan.candidates.length,
        blockedDuplicateConflicts: plan.blockedDuplicateConflicts.length,
        duplicateExactDeduped: plan.candidates.filter((candidate) => candidate.result === "DUPLICATE_EXACT_DEDUPED").length,
        invalidMetadata: plan.invalidMetadata.length,
      },
    });
  } catch (error) {
    console.error("Match Master preview failed", error);
    return NextResponse.json({ error: "Unable to generate the Match Master preview." }, { status: 500 });
  }
}

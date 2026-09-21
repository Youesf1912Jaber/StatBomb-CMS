import { NextResponse } from "next/server";
import { classifyDistributionRows } from "@/lib/distribution-preview";
import { readDistributionRowsForPreview } from "@/lib/sync/google-sheets";
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
    const [distributionRows, profilesResult, matchesResult, assignmentsResult] = await Promise.all([
      readDistributionRowsForPreview(),
      supabase.from("profiles").select("*"),
      supabase.from("matches").select("*"),
      supabase.from("assignments").select("*"),
    ]);
    if (profilesResult.error) throw profilesResult.error;
    if (matchesResult.error) throw matchesResult.error;
    if (assignmentsResult.error) throw assignmentsResult.error;
    const preview = classifyDistributionRows(
      distributionRows,
      profilesResult.data ?? [],
      matchesResult.data ?? [],
      assignmentsResult.data ?? [],
    );
    return NextResponse.json(preview);
  } catch (error) {
    console.error("Distribution preview failed", error);
    return NextResponse.json({ error: "Unable to generate the Distribution preview." }, { status: 500 });
  }
}

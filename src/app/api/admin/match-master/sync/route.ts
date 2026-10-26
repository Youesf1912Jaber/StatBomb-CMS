import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncMatchMasterCache } from "@/lib/match-master-cache-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profileError || profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  try {
    const result = await syncMatchMasterCache();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Manual Match Master cache sync failed", error);
    return NextResponse.json({ error: "Match Master cache sync failed. Existing cache was retained where possible." }, { status: 500 });
  }
}

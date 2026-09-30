import { NextResponse } from "next/server";
import { syncFfShots } from "@/lib/ff-shots/sync";
import { PreviewInputError } from "@/lib/sync/preview";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

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
    const result = await syncFfShots(createServiceRoleClient());
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Admin FF Shots refresh failed", error);
    const message = error instanceof PreviewInputError
      ? error.safeMessage
      : "Unable to refresh FF Shots.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

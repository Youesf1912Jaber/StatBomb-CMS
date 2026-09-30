import { NextResponse } from "next/server";
import { syncDeductions } from "@/lib/deductions/sync";
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
    const result = await syncDeductions(createServiceRoleClient());
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Admin deductions refresh failed", error);
    const message = error instanceof PreviewInputError
      ? error.safeMessage
      : "Unable to refresh Deductions.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

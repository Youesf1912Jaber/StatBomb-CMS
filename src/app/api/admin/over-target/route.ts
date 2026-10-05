import { NextResponse } from "next/server";
import { getAllOverTargetRecords } from "@/lib/over-target/queries";
import { PreviewInputError } from "@/lib/sync/preview";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  try {
    const records = await getAllOverTargetRecords(supabase);
    return NextResponse.json({ records });
  } catch (error) {
    console.error("Admin Over Target list failed", error);
    const message = error instanceof PreviewInputError ? error.safeMessage : "Unable to read Over Target.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

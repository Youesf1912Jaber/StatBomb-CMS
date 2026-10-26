import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchHistoricalAssignmentsByMatchId } from "@/lib/assignments/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const matchId = (url.searchParams.get("matchId") ?? "").trim();
  if (matchId.replace(/[,%_]/g, "").length < 2 || matchId.length > 80) {
    return NextResponse.json(
      { error: "Enter at least 2 characters of the Match ID." },
      { status: 400 }
    );
  }

  try {
    const assignments = await searchHistoricalAssignmentsByMatchId(supabase, matchId);
    const collectorIds = [...new Set(assignments.map((assignment) => assignment.collector_id))];
    const collectorNames: Record<string, string> = {};

    if (collectorIds.length > 0) {
      const { data: collectors, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", collectorIds);
      if (error) throw error;

      for (const collector of collectors ?? []) {
        collectorNames[collector.id] = collector.full_name ?? collector.email;
      }
    }

    return NextResponse.json({ assignments, collectorNames });
  } catch {
    return NextResponse.json(
      { error: "Could not search historical assignments right now." },
      { status: 500 }
    );
  }
}

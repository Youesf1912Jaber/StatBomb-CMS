import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { parseMatchMasterSla, syncMatchMasterCache } from "@/lib/match-master-cache-sync";
import { readMatchesMasterSheet } from "@/lib/sync/google-sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data: profile, error: profileError } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profileError || profile?.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  try {
    const sourceRows = await readMatchesMasterSheet();
    const service = createServiceRoleClient();
    const cachedRows: Array<{ match_id: string; match_data: Record<string, unknown> | null; sla_sort_at: string | null; eta_date: string | null }> = [];
    // Supabase REST responses are capped, commonly at 1,000 rows. Fetch every page.
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await service.from("match_master_cache")
        .select("match_id, match_data, sla_sort_at, eta_date")
        .order("match_id", { ascending: true })
        .range(offset, offset + 999);
      if (error) throw error;
      cachedRows.push(...(data ?? []).map((row) => ({
        match_id: row.match_id,
        match_data: row.match_data as Record<string, unknown> | null,
        sla_sort_at: row.sla_sort_at,
        eta_date: row.eta_date,
      })));
      if (!data || data.length < 1000) break;
    }

    const counts = new Map<string, number>();
    for (const row of sourceRows) counts.set(row.match_id, (counts.get(row.match_id) ?? 0) + 1);
    const cacheById = new Map(cachedRows.map((row) => [row.match_id, row]));
    const changes: Array<{ matchId: string; fields: string[] }> = [];
    let newRows = 0;
    for (const source of sourceRows) {
      if ((counts.get(source.match_id) ?? 0) > 1) continue;
      const cached = cacheById.get(source.match_id);
      if (!cached) { newRows += 1; continue; }
      const previous = (cached.match_data ?? {}) as Record<string, unknown>;
      // SLA values can be represented differently by Google Sheets (formatted
      // display text vs normalized timestamp). Compare SLA only through the same
      // parser used by the cache sync, not as raw strings.
      const fields = Object.keys(source).filter((key) => {
        if (key === "sla") return false;
        const before = previous[key] == null ? "" : String(previous[key]).trim();
        const afterValue = source[key as keyof typeof source];
        const after = afterValue == null ? "" : String(afterValue).trim();
        return before !== after;
      });
      const sourceSla = parseMatchMasterSla(source.sla);
      const cachedSlaMs = cached.sla_sort_at ? Date.parse(cached.sla_sort_at) : null;
      const sourceSlaMs = sourceSla ? Date.parse(sourceSla) : null;
      const slaMatches = cachedSlaMs === null && sourceSlaMs === null
        ? true
        : cachedSlaMs !== null && sourceSlaMs !== null && cachedSlaMs === sourceSlaMs;
      if (!slaMatches) fields.push("sla");
      if (fields.length) changes.push({ matchId: source.match_id, fields });
    }
    return NextResponse.json({
      success: true,
      changedMatches: changes.length,
      newMatches: newRows,
      duplicateIdsSkipped: [...counts.values()].filter((count) => count > 1).length,
      sample: changes.slice(0, 12),
      pendingChanges: changes,
    });
  } catch (error) {
    console.error("Match Master change check failed", error);
    return NextResponse.json({ error: "Unable to check Match Master sheet changes." }, { status: 500 });
  }
}

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

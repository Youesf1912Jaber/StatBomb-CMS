import { NextResponse } from "next/server";
import { buildMatchMasterApplyPlan, classifyMatchMasterRows, createMatchMasterPreviewFingerprint, fetchAllMatches } from "@/lib/match-master-preview";
import { parseMatchMasterSla } from "@/lib/match-master-cache-sync";
import { readMatchesMasterSheetForPreview } from "@/lib/sync/google-sheets";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

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
    // Read the Google Sheet once and reuse this exact snapshot for both reports.
    const [sourceRows, matches] = await Promise.all([
      readMatchesMasterSheetForPreview(),
      fetchAllMatches(supabase),
    ]);
    const preview = classifyMatchMasterRows(sourceRows, matches);
    const plan = buildMatchMasterApplyPlan(sourceRows, matches);

    // Keep the existing change-check behavior, but run it against the same sheet
    // snapshot instead of triggering a second Google Sheets read from the client.
    const service = createServiceRoleClient();
    const cachedRows: Array<{
      match_id: string;
      match_data: Record<string, unknown> | null;
      sla_sort_at: string | null;
    }> = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await service.from("match_master_cache")
        .select("match_id, match_data, sla_sort_at")
        .order("match_id", { ascending: true })
        .range(offset, offset + 999);
      if (error) throw error;
      cachedRows.push(...(data ?? []).map((row) => ({
        match_id: row.match_id,
        match_data: row.match_data as Record<string, unknown> | null,
        sla_sort_at: row.sla_sort_at,
      })));
      if (!data || data.length < 1000) break;
    }

    const counts = new Map<string, number>();
    for (const row of sourceRows) counts.set(row.match_id, (counts.get(row.match_id) ?? 0) + 1);
    const cacheById = new Map(cachedRows.map((row) => [row.match_id, row]));
    const changes: Array<{
      matchId: string;
      fields: string[];
      details: Array<{ field: string; before: string; after: string }>;
    }> = [];
    let newRows = 0;
    for (const source of sourceRows) {
      if ((counts.get(source.match_id) ?? 0) > 1) continue;
      const cached = cacheById.get(source.match_id);
      if (!cached) { newRows += 1; continue; }
      const previous = cached.match_data ?? {};
      const details: Array<{ field: string; before: string; after: string }> = [];
      for (const key of Object.keys(source)) {
        const beforeValue = previous[key];
        const afterValue = source[key as keyof typeof source];
        const before = beforeValue == null ? "" : String(beforeValue).trim();
        const after = afterValue == null ? "" : String(afterValue).trim();
        if (key === "sla") {
          const sourceSla = parseMatchMasterSla(source.sla);
          const cachedSlaMs = cached.sla_sort_at ? Date.parse(cached.sla_sort_at) : null;
          const sourceSlaMs = sourceSla ? Date.parse(sourceSla) : null;
          const slaMatches = cachedSlaMs === null && sourceSlaMs === null
            ? true
            : cachedSlaMs !== null && sourceSlaMs !== null && cachedSlaMs === sourceSlaMs;
          if (!slaMatches) details.push({
            field: key,
            before: before || cached.sla_sort_at || "—",
            after: after || "—",
          });
          continue;
        }
        if (before !== after) details.push({
          field: key,
          before: before || "—",
          after: after || "—",
        });
      }
      if (details.length) changes.push({
        matchId: source.match_id,
        fields: details.map((item) => item.field),
        details,
      });
    }

    return NextResponse.json({
      preview: {
        ...preview,
        fingerprint: createMatchMasterPreviewFingerprint(sourceRows, matches),
        apply: {
          candidates: plan.candidates.length,
          blockedDuplicateConflicts: plan.blockedDuplicateConflicts.length,
          duplicateExactDeduped: plan.candidates.filter((candidate) => candidate.result === "DUPLICATE_EXACT_DEDUPED").length,
          invalidMetadata: plan.invalidMetadata.length,
        },
      },
      changeCheck: {
        success: true,
        changedMatches: changes.length,
        newMatches: newRows,
        duplicateIdsSkipped: [...counts.values()].filter((count) => count > 1).length,
        sample: changes.slice(0, 12),
        pendingChanges: changes,
      },
    });
  } catch (error) {
    console.error("Match Master combined preview failed", error);
    return NextResponse.json({ error: "Unable to generate the Match Master preview." }, { status: 500 });
  }
}

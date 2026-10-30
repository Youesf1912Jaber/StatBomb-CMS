import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { buildMatchMasterApplyPlan, classifyMatchMasterRows, createMatchMasterPreviewFingerprint, fetchMatchMasterPreviewMatches } from "@/lib/match-master-preview";
import { parseMatchMasterSla, syncMatchMasterCache } from "@/lib/match-master-cache-sync";
import { readMatchesMasterSheetForPreview } from "@/lib/sync/google-sheets";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sourceFingerprint(source: Record<string, unknown>): string {
  const { source_row: _sourceRow, raw_match_id: _rawMatchId, match_id_valid: _valid, ...cacheRow } = source;
  return createHash("sha256").update(stableStringify(cacheRow)).digest("hex");
}

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
      fetchMatchMasterPreviewMatches(supabase),
    ]);
    const preview = classifyMatchMasterRows(sourceRows, matches);
    const plan = buildMatchMasterApplyPlan(sourceRows, matches);

    // First fetch compact cache metadata. Full JSON payloads are fetched only for
    // matches whose source fingerprint changed (or whose legacy fingerprint is absent).
    const service = createServiceRoleClient();
    const cachedRows: Array<{
      match_id: string;
      source_fingerprint: string | null;
      sla_sort_at: string | null;
    }> = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await service.from("match_master_cache")
        .select("match_id, source_fingerprint, sla_sort_at")
        .order("match_id", { ascending: true })
        .range(offset, offset + 999);
      if (error) throw error;
      cachedRows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }

    const counts = new Map<string, number>();
    for (const row of sourceRows) counts.set(row.match_id, (counts.get(row.match_id) ?? 0) + 1);
    const cacheById = new Map(cachedRows.map((row) => [row.match_id, row]));
    const changedSources = sourceRows.filter((source) => {
      if ((counts.get(source.match_id) ?? 0) > 1) return false;
      const cached = cacheById.get(source.match_id);
      if (!cached) return false;
      return !cached.source_fingerprint || cached.source_fingerprint !== sourceFingerprint(source as unknown as Record<string, unknown>);
    });

    const previousById = new Map<string, Record<string, unknown>>();
    for (let offset = 0; offset < changedSources.length; offset += 100) {
      const ids = changedSources.slice(offset, offset + 100).map((source) => source.match_id);
      const { data, error } = await service.from("match_master_cache")
        .select("match_id, match_data")
        .in("match_id", ids);
      if (error) throw error;
      for (const row of data ?? []) {
        previousById.set(row.match_id, (row.match_data ?? {}) as Record<string, unknown>);
      }
    }

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
      const previous = previousById.get(source.match_id);
      // A matching fingerprint guarantees there are no field-level differences.
      if (!previous) continue;
      const details: Array<{ field: string; before: string; after: string }> = [];
      for (const key of Object.keys(source)) {
        if (key === "source_row" || key === "raw_match_id" || key === "match_id_valid") continue;
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

export async function POST() {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data: profile, error: profileError } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profileError || profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  try {
    // One source snapshot powers both the cache update and the refreshed preview.
    const sourceRows = await readMatchesMasterSheetForPreview();
    const syncResult = await syncMatchMasterCache(sourceRows);
    const matches = await fetchMatchMasterPreviewMatches(supabase);
    const preview = classifyMatchMasterRows(sourceRows, matches);
    const plan = buildMatchMasterApplyPlan(sourceRows, matches);
    const counts = new Map<string, number>();
    for (const row of sourceRows) counts.set(row.match_id, (counts.get(row.match_id) ?? 0) + 1);

    return NextResponse.json({
      success: true,
      sync: syncResult,
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
        changedMatches: 0,
        newMatches: 0,
        duplicateIdsSkipped: [...counts.values()].filter((count) => count > 1).length,
        sample: [],
        pendingChanges: [],
      },
    });
  } catch (error) {
    console.error("Match Master Check & Update failed", error);
    return NextResponse.json({ error: "Unable to check and update Match Master details." }, { status: 500 });
  }
}

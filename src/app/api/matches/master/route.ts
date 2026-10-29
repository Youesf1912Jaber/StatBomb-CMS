import { NextResponse } from "next/server";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import { createClient } from "@/lib/supabase/server";
import { normalizeMatchId, normalizeDistributionHalf } from "@/lib/sync/distribution-identity";
import type { MatchMasterRow } from "@/lib/sync/google-sheets";
import { normalizeEtaDate } from "@/lib/match-master-date";
import { syncMatchMasterCache } from "@/lib/match-master-cache-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DistributionSummary = { halves: string[]; tasks: string[] };
type MatchWithDistribution = MatchMasterRow & { distribution: DistributionSummary | null };

function matchesQuery(match: { match_id: string; home_team: string | null; away_team: string | null }, query: string): boolean {
  const q = query.trim().toLocaleLowerCase();
  return !q || [match.match_id, match.home_team, match.away_team].some((value) => value?.toLocaleLowerCase().includes(q));
}

export async function GET(request: Request) {
  try {
    const profile = await getProfileOrRedirect();
    if (profile.role !== "admin") {
      return NextResponse.json({ success: false, error: "Admin access required." }, { status: 403 });
    }

    const url = new URL(request.url);
    const view = url.searchParams.get("view") ?? "days";
    const etaDate = url.searchParams.get("etaDate") ?? "";
    const query = (url.searchParams.get("q") ?? "").trim().replace(/[,%_()]/g, "").slice(0, 120);
    if (view !== "days" && view !== "matches") {
      return NextResponse.json({ success: false, error: "Invalid Match Master view." }, { status: 400 });
    }
    if (view === "matches" && !etaDate && !query) {
      return NextResponse.json({ success: false, error: "Choose an ETA day or enter a search." }, { status: 400 });
    }

    const supabase = createClient();
    if (view === "days" && !query) {
      let { data, error } = await supabase.rpc("get_match_master_eta_days");
      if (error) throw error;
      // Bootstrap only when the cache is empty. Normal requests never read Google Sheets.
      if (!data?.length) {
        await syncMatchMasterCache();
        const refreshed = await supabase.rpc("get_match_master_eta_days");
        data = refreshed.data;
        error = refreshed.error;
        if (error) throw error;
      }
      const days = (data ?? []).map((row) => ({ date: row.eta_date, count: Number(row.match_count) }));
      return NextResponse.json({ success: true, days });
    }

    const { data: activeWindowRows, error: activeWindowError } = await supabase.rpc("get_match_master_active_window");
    if (activeWindowError) throw activeWindowError;
    const activeWindow = activeWindowRows?.[0] ?? null;

    let cacheQuery = supabase
      .from("match_master_cache")
      .select("match_id, eta_date, sla_sort_at, home_team, away_team, match_data")
      .order("sla_sort_at", { ascending: true, nullsFirst: false })
      .order("match_id", { ascending: true })
      .limit(1000);

    // Historical rows remain in the cache as archive, but Match Master only
    // exposes rows inside the persisted active window.
    if (!activeWindow) {
      return NextResponse.json({ success: true, count: 0, matches: [], activeWindow: null });
    }
    cacheQuery = cacheQuery.gte("eta_date", activeWindow.window_start_date).lte("eta_date", activeWindow.window_end_date);
    if (etaDate) {
      if (etaDate < activeWindow.window_start_date || etaDate > activeWindow.window_end_date) {
        return NextResponse.json({ success: true, count: 0, matches: [], archived: true, activeWindow });
      }
      cacheQuery = cacheQuery.eq("eta_date", etaDate);
    }
    if (query) {
      const pattern = `%${query}%`;
      cacheQuery = cacheQuery.or(`match_id.ilike.${pattern},home_team.ilike.${pattern},away_team.ilike.${pattern}`);
    }

    const { data: cachedRows, error: cacheError } = await cacheQuery;
    if (cacheError) throw cacheError;

    const selected = (cachedRows ?? []).map((row) => ({
      ...((row.match_data ?? {}) as unknown as MatchMasterRow),
      match_id: normalizeMatchId(row.match_id) ?? row.match_id,
      eta: row.eta_date ?? ((row.match_data as Record<string, unknown> | null)?.eta as string | null) ?? null,
      sla: row.sla_sort_at ?? ((row.match_data as Record<string, unknown> | null)?.sla as string | null) ?? null,
    })).filter((match) => matchesQuery(match, query));

    const externalIds = [...new Set(selected.map((match) => match.match_id))];
    const externalIdToInternalId = new Map<string, string>();
    for (let offset = 0; offset < externalIds.length; offset += 400) {
      const { data, error } = await supabase.from("matches")
        .select("id, external_id")
        .in("external_id", externalIds.slice(offset, offset + 400));
      if (error) throw error;
      for (const match of data ?? []) {
        const externalId = normalizeMatchId(match.external_id);
        if (externalId) externalIdToInternalId.set(externalId, match.id);
      }
    }

    const internalIds = [...new Set(selected.map((match) => externalIdToInternalId.get(match.match_id)).filter((id): id is string => Boolean(id)))];
    const assignments: Array<{ match_id: string; task: string; half: string; distribution_present: boolean }> = [];
    for (let offset = 0; offset < internalIds.length; offset += 400) {
      const { data, error } = await supabase.from("assignments")
        .select("match_id, task, half, distribution_present")
        .in("match_id", internalIds.slice(offset, offset + 400));
      if (error) throw error;
      assignments.push(...(data ?? []));
    }

    const externalIdByInternalId = new Map([...externalIdToInternalId.entries()].map(([external, internal]) => [internal, external] as const));
    const distributionByExternalId = new Map<string, { halves: Set<string>; tasks: Set<string> }>();
    for (const assignment of assignments) {
      if (assignment.distribution_present === false) continue;
      const externalId = externalIdByInternalId.get(assignment.match_id);
      if (!externalId) continue;
      const current = distributionByExternalId.get(externalId) ?? { halves: new Set<string>(), tasks: new Set<string>() };
      current.halves.add(normalizeDistributionHalf(assignment.half));
      const task = String(assignment.task ?? "").trim();
      if (task) current.tasks.add(task);
      distributionByExternalId.set(externalId, current);
    }

    const matches: MatchWithDistribution[] = selected.map((match) => {
      const distribution = distributionByExternalId.get(match.match_id);
      return {
        ...match,
        distribution: distribution ? {
          halves: [...distribution.halves].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
          tasks: [...distribution.tasks].sort((a, b) => a.localeCompare(b)),
        } : null,
      };
    });

    return NextResponse.json({ success: true, count: matches.length, matches, activeWindow });
  } catch (error) {
    console.error("Match Master cache query failed", error);
    return NextResponse.json({ success: false, error: "Match Master data could not be loaded from cache." }, { status: 500 });
  }
}

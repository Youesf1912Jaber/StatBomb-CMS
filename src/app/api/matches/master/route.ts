import { NextResponse } from "next/server";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import { createClient } from "@/lib/supabase/server";
import { getCachedMatchMasterRows } from "@/lib/match-master-sheet-cache";
import { normalizeMatchId, normalizeDistributionHalf } from "@/lib/sync/distribution-identity";
import { normalizeEtaDate } from "@/lib/match-master-date";
import { PreviewInputError } from "@/lib/sync/preview";

export const runtime = "nodejs";

type DistributionSummary = { halves: string[]; tasks: string[] };
type MatchWithDistribution = Awaited<ReturnType<typeof getCachedMatchMasterRows>>[number] & {
  distribution: DistributionSummary | null;
};

function parseSlaTimestamp(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const raw = value.trim();
  const usDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
  if (usDate) {
    const month = Number(usDate[1]), day = Number(usDate[2]), year = Number(usDate[3]);
    let hour = Number(usDate[4] ?? 0);
    const minute = Number(usDate[5] ?? 0), second = Number(usDate[6] ?? 0);
    const meridiem = usDate[7]?.toUpperCase();
    if (meridiem === "PM" && hour < 12) hour += 12;
    if (meridiem === "AM" && hour === 12) hour = 0;
    const timestamp = new Date(year, month - 1, day, hour, minute, second).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function sortByNearestSla<T extends { sla: string | null }>(rows: T[]): T[] {
  return rows.map((row, index) => ({ row, index, sla: parseSlaTimestamp(row.sla) }))
    .sort((a, b) => {
      if (a.sla === null && b.sla === null) return a.index - b.index;
      if (a.sla === null) return 1;
      if (b.sla === null) return -1;
      return a.sla - b.sla || a.index - b.index;
    })
    .map(({ row }) => row);
}

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
    const query = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
    if (view !== "days" && view !== "matches") {
      return NextResponse.json({ success: false, error: "Invalid Match Master view." }, { status: 400 });
    }
    if (view === "matches" && !etaDate && !query) {
      return NextResponse.json({ success: false, error: "Choose an ETA day or enter a search." }, { status: 400 });
    }

    const matches = await getCachedMatchMasterRows();
    if (view === "days" && !query) {
      const counts = new Map<string, number>();
      for (const match of matches) {
        const date = normalizeEtaDate(match.eta);
        if (date) counts.set(date, (counts.get(date) ?? 0) + 1);
      }
      const days = [...counts.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => b.date.localeCompare(a.date));
      return NextResponse.json({ success: true, days });
    }

    const selected = matches.filter((match) => {
      const dateMatches = !etaDate || normalizeEtaDate(match.eta) === etaDate;
      return dateMatches && matchesQuery(match, query);
    });
    const supabase = createClient();
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

    const matchesWithDistribution: MatchWithDistribution[] = selected.map((match) => {
      const distribution = distributionByExternalId.get(match.match_id);
      return {
        ...match,
        distribution: distribution ? {
          halves: [...distribution.halves].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
          tasks: [...distribution.tasks].sort((a, b) => a.localeCompare(b)),
        } : null,
      };
    });

    return NextResponse.json({ success: true, count: matchesWithDistribution.length, matches: sortByNearestSla(matchesWithDistribution) });
  } catch (error) {
    const message = error instanceof PreviewInputError ? error.safeMessage : "The Match Master sheet could not be read.";
    const status = error instanceof PreviewInputError ? 422 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

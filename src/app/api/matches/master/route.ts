import { NextResponse } from "next/server";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import { createClient } from "@/lib/supabase/server";
import { fetchAllMatches } from "@/lib/match-master-preview";
import { readMatchesMasterSheet } from "@/lib/sync/google-sheets";
import { normalizeMatchId, normalizeDistributionHalf } from "@/lib/sync/distribution-identity";
import { PreviewInputError } from "@/lib/sync/preview";

export const runtime = "nodejs";

const ASSIGNMENTS_PAGE_SIZE = 1000;

export async function GET() {
  try {
    const profile = await getProfileOrRedirect();
    if (profile.role !== "admin") {
      return NextResponse.json({ success: false, error: "Admin access required." }, { status: 403 });
    }

    const supabase = createClient();
    const [matches, databaseMatches] = await Promise.all([
      readMatchesMasterSheet(),
      fetchAllMatches(supabase),
    ]);

    // Supabase/PostgREST limits individual result sets. Fetch every assignment
    // page so distributions are not silently missed on larger installations.
    const assignments: Array<{
      match_id: string;
      task: string;
      half: string;
      distribution_present: boolean;
    }> = [];
    for (let from = 0; ; from += ASSIGNMENTS_PAGE_SIZE) {
      const { data, error } = await supabase
        .from("assignments")
        .select("id, match_id, task, half, distribution_present")
        .order("id", { ascending: true })
        .range(from, from + ASSIGNMENTS_PAGE_SIZE - 1);
      if (error) throw error;
      const page = data ?? [];
      assignments.push(...page);
      if (page.length < ASSIGNMENTS_PAGE_SIZE) break;
    }

    const externalIdByMatchId = new Map<string, string>();
    for (const match of databaseMatches) {
      const externalId = normalizeMatchId(match.external_id);
      if (externalId) externalIdByMatchId.set(match.id, externalId);
    }

    const distributionByExternalId = new Map<string, { halves: Set<string>; tasks: Set<string> }>();
    for (const assignment of assignments) {
      if (assignment.distribution_present === false) continue;
      const externalId = externalIdByMatchId.get(assignment.match_id);
      if (!externalId) continue;
      const current = distributionByExternalId.get(externalId) ?? { halves: new Set<string>(), tasks: new Set<string>() };
      current.halves.add(normalizeDistributionHalf(assignment.half));
      const task = String(assignment.task ?? "").trim();
      if (task) current.tasks.add(task);
      distributionByExternalId.set(externalId, current);
    }

    const matchesWithDistribution = matches.map((match) => {
      const distribution = distributionByExternalId.get(match.match_id);
      return {
        ...match,
        distribution: distribution ? {
          halves: [...distribution.halves].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
          tasks: [...distribution.tasks].sort((a, b) => a.localeCompare(b)),
        } : null,
      };
    });

    return NextResponse.json({ success: true, count: matches.length, matches: matchesWithDistribution });
  } catch (error) {
    const message = error instanceof PreviewInputError
      ? error.safeMessage
      : "The Match Master sheet could not be read.";
    const status = error instanceof PreviewInputError ? 422 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

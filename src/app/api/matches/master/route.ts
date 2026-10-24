import { NextResponse } from "next/server";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import { createClient } from "@/lib/supabase/server";
import { readMatchesMasterSheet } from "@/lib/sync/google-sheets";
import { normalizeMatchId, normalizeDistributionHalf } from "@/lib/sync/distribution-identity";
import { PreviewInputError } from "@/lib/sync/preview";

export const runtime = "nodejs";

export async function GET() {
  try {
    const profile = await getProfileOrRedirect();
    if (profile.role !== "admin") {
      return NextResponse.json({ success: false, error: "Admin access required." }, { status: 403 });
    }

    const [matches, supabase] = await Promise.all([readMatchesMasterSheet(), Promise.resolve(createClient())]);
    const [{ data: databaseMatches, error: matchesError }, { data: assignments, error: assignmentsError }] = await Promise.all([
      supabase.from("matches").select("id, external_id"),
      supabase.from("assignments").select("match_id, task, half, distribution_present"),
    ]);
    if (matchesError) throw matchesError;
    if (assignmentsError) throw assignmentsError;

    const externalIdByMatchId = new Map<string, string>();
    for (const match of databaseMatches ?? []) {
      const externalId = normalizeMatchId(match.external_id);
      if (externalId) externalIdByMatchId.set(match.id, externalId);
    }

    const distributionByExternalId = new Map<string, { halves: Set<string>; tasks: Set<string> }>();
    for (const assignment of assignments ?? []) {
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

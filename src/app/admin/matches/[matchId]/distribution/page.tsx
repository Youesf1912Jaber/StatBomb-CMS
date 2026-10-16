import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import { HyperCareSection } from "@/components/HyperCareSection";
import { getHyperCareForMatch } from "@/lib/hyper-care/lookup";
import { DistributionAssignmentForm } from "./DistributionAssignmentForm";
import { DistributionRowsClient } from "./DistributionRowsClient";
import { normalizeMatchId, pullTeamSheet, readDistributionRowsForMatch, readMatchesMasterSheet } from "@/lib/sync/google-sheets";

export default async function MatchDistributionPage({
  params,
}: {
  params: { matchId: string };
}) {
  const profile = await getProfileOrRedirect();
  if (profile.role !== "admin") {
    redirect("/collector");
  }

  const normalizedMatchId = normalizeMatchId(params.matchId);
  if (!normalizedMatchId) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-chalk-200">This match ID is not valid.</p>
        <Link href="/admin/matches" className="text-sm text-clock-amber underline">Back to Match Master</Link>
      </div>
    );
  }

  const matches = await readMatchesMasterSheet();
  const match = matches.find((row) => normalizeMatchId(row.match_id) === normalizedMatchId) ?? null;
  const distribution = await readDistributionRowsForMatch(normalizedMatchId);
  const collectors = await pullTeamSheet();
  const hyperCare = match
    ? await getHyperCareForMatch(match.home_team, match.away_team)
    : [];

  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-pitch-500">Match Distribution</p>
          <h1 className="mt-1 font-display text-2xl text-chalk-50">
            {match ? `${match.home_team ?? "Unknown"} vs ${match.away_team ?? "Unknown"}` : `Match ${normalizedMatchId}`}
          </h1>
          <p className="mt-1 text-sm text-chalk-200">
            {match?.competition_name ?? "Competition unknown"} · {match?.match_date ?? "No date"}
          </p>
        </div>
        <Link href="/admin/matches" className="inline-flex rounded-[8px] border border-pitch-700 px-3 py-2 text-sm text-chalk-50 hover:border-clock-amber">
          Back to Match Master
        </Link>
      </div>

      {match && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-card border border-pitch-700 bg-pitch-900 p-5 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-chalk-200">Match ID</dt>
            <dd className="mt-0.5 text-chalk-50">{match.match_id}</dd>
          </div>
          <div>
            <dt className="text-chalk-200">Home Team</dt>
            <dd className="mt-0.5 text-chalk-50">{match.home_team ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-chalk-200">Away Team</dt>
            <dd className="mt-0.5 text-chalk-50">{match.away_team ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-chalk-200">Competition</dt>
            <dd className="mt-0.5 text-chalk-50">{match.competition_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-chalk-200">Season</dt>
            <dd className="mt-0.5 text-chalk-50">{match.season_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-chalk-200">Country</dt>
            <dd className="mt-0.5 text-chalk-50">{match.country ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-chalk-200">Match Date</dt>
            <dd className="mt-0.5 text-chalk-50">{match.match_date ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-chalk-200">Kick-Off</dt>
            <dd className="mt-0.5 text-chalk-50">{match.kick_off_time ?? "—"}</dd>
          </div>
        </dl>
      )}

      <div className="grid min-w-0 grid-cols-1 items-start gap-5 xl:grid-cols-2">
        {match && (
          <section className="min-w-0 overflow-hidden rounded-card border border-pitch-700 bg-pitch-950/30">
            <div className="border-b border-pitch-700 px-4 py-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-pitch-500">Priority Match Notes</p>
              <h2 className="mt-1 font-display text-lg text-chalk-50">Hyper Care</h2>
              <p className="text-xs text-chalk-200">Special review notes and team requests</p>
            </div>
            <div className="p-3 sm:p-4">
              <HyperCareSection sections={hyperCare} />
            </div>
          </section>
        )}

        <section className="min-w-0">
          {match ? (
            <DistributionAssignmentForm matchId={normalizedMatchId} collectors={collectors} />
          ) : (
            <div className="rounded-card border border-red-900 bg-red-950/40 p-4 text-sm text-red-200">
              This Match ID is not present in Match Master, so no assignment can be added.
            </div>
          )}
        </section>
      </div>

      <section className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-pitch-700 bg-pitch-900 px-4 py-3">
          <div>
            <h2 className="font-display text-lg text-chalk-50">Distribution Assignments</h2>
            <p className="mt-1 text-sm text-chalk-200">Review and edit assignments currently linked to this match.</p>
          </div>
          <span className="rounded-full border border-pitch-600 bg-pitch-950 px-3 py-1 text-xs text-chalk-100">
            {distribution.length} row{distribution.length === 1 ? "" : "s"}
          </span>
        </div>
        <DistributionRowsClient matchId={normalizedMatchId} distribution={distribution} collectors={collectors} />
      </section>
    </div>
  );
}

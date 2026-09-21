import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
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

  return (
    <div className="space-y-6">
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

      {match ? (
        <DistributionAssignmentForm matchId={normalizedMatchId} collectors={collectors} />
      ) : (
        <div className="rounded-card border border-red-900 bg-red-950/40 p-4 text-sm text-red-200">
          This Match ID is not present in Match Master, so no assignment can be added.
        </div>
      )}

      <div className="rounded-card border border-pitch-700 bg-pitch-900 p-4">
        <p className="text-sm text-chalk-200">
          {distribution.length} Distribution row{distribution.length === 1 ? "" : "s"} for Match {normalizedMatchId}.
        </p>
      </div>

      <DistributionRowsClient matchId={normalizedMatchId} distribution={distribution} collectors={collectors} />
    </div>
  );
}

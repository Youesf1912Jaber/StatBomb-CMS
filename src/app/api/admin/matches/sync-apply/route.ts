import { NextResponse } from "next/server";
import { buildMatchMasterApplyPlan, createMatchMasterPreviewFingerprint, fetchAllMatches, normalizeMatchMasterDate, normalizeMatchMasterKickoff } from "@/lib/match-master-preview";
import { readMatchesMasterSheetForPreview } from "@/lib/sync/google-sheets";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { MatchRow } from "@/types/database.types";
import { acquireMatchMasterSyncLock, releaseMatchMasterSyncLock } from "@/lib/match-master-sync-lock";

export const runtime = "nodejs";
const BATCH_SIZE = 100;

function validDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function validKickoff(value: string | null): value is string {
  if (!value || !/^\d{2}:\d{2}:\d{2}$/.test(value)) return false;
  const [hour, minute, second] = value.split(":").map(Number);
  return hour !== undefined && minute !== undefined && second !== undefined &&
    hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && second >= 0 && second <= 59;
}

function insertRow(source: {
  match_id: string;
  home_team: string | null;
  away_team: string | null;
  competition_name: string | null;
  match_date: string | null;
  kick_off_time: string | null;
}) {
  const matchDate = normalizeMatchMasterDate(source.match_date);
  const kickoff = normalizeMatchMasterKickoff(source.kick_off_time);
  if (!source.home_team || !source.away_team || !validDate(matchDate) || !validKickoff(kickoff)) {
    return null;
  }
  return {
    external_id: source.match_id,
    home_team: source.home_team,
    away_team: source.away_team,
    competition: source.competition_name,
    match_date: matchDate,
    kickoff_time: `${matchDate}T${kickoff}`,
    official_website_url: null,
  };
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  let body: { fingerprint?: string };
  try {
    body = await request.json() as { fingerprint?: string };
  } catch {
    return NextResponse.json({ error: "A fresh preview fingerprint is required." }, { status: 400 });
  }
  if (!body.fingerprint) return NextResponse.json({ error: "A fresh preview fingerprint is required." }, { status: 400 });

  const lock = await acquireMatchMasterSyncLock();
  if (!lock) {
    return NextResponse.json({ error: "Another Match Master sync or Apply operation is already running. Please try again shortly." }, { status: 409 });
  }

  try {
    const [sourceRows, currentMatches] = await Promise.all([
      readMatchesMasterSheetForPreview(),
      fetchAllMatches(supabase),
    ]);
    const currentFingerprint = createMatchMasterPreviewFingerprint(sourceRows, currentMatches);
    if (currentFingerprint !== body.fingerprint) {
      return NextResponse.json({ error: "Source or Supabase Match Master data changed. Refresh the preview before applying." }, { status: 409 });
    }

    const plan = buildMatchMasterApplyPlan(sourceRows, currentMatches);
    const invalidRows = [...plan.invalidMetadata];
    const inserts = plan.candidates.flatMap((candidate) => {
      const row = insertRow(candidate.source);
      if (!row) {
        const previewRow = {
          sourceRow: candidate.source.source_row,
          matchId: candidate.source.match_id,
          rawMatchId: candidate.source.raw_match_id,
          homeTeam: candidate.source.home_team,
          awayTeam: candidate.source.away_team,
          competition: candidate.source.competition_name,
          season: candidate.source.season_name,
          matchDate: candidate.source.match_date,
          kickoff: candidate.source.kick_off_time,
          result: "INVALID_MATCH_ID" as const,
          reason: "Match metadata cannot be represented safely in the Supabase schema.",
          duplicateRows: [],
        };
        invalidRows.push(previewRow);
        return [];
      }
      return [{ candidate, row }];
    });
    const service = createServiceRoleClient();
    const applied: { external_id: string; sourceRow: number; result: string }[] = [];
    const failed: { external_id: string; error: string }[] = [];

    async function verifyInserted(item: (typeof inserts)[number]): Promise<void> {
      const { data: actual, error: verifyError } = await service
        .from("matches")
        .select("*")
        .eq("external_id", item.row.external_id)
        .maybeSingle();
      if (verifyError) {
        failed.push({ external_id: item.row.external_id, error: verifyError.message });
        return;
      }
      if (!actual || actual.home_team !== item.row.home_team || actual.away_team !== item.row.away_team ||
        actual.competition !== item.row.competition || actual.match_date !== item.row.match_date ||
        actual.kickoff_time !== item.row.kickoff_time) {
        failed.push({ external_id: item.row.external_id, error: "Inserted row failed field verification." });
        return;
      }
      applied.push({ external_id: item.row.external_id, sourceRow: item.candidate.retainedSourceRow, result: item.candidate.result });
    }

    async function insertOne(item: (typeof inserts)[number], fallbackError?: string): Promise<void> {
      const { error } = await service.from("matches").insert(item.row);
      if (!error) {
        await verifyInserted(item);
        return;
      }
      const duplicate = error.code === "23505" || error.message.includes("matches_external_id_key") || error.message.includes("duplicate key");
      if (duplicate) {
        const { data: existing, error: lookupError } = await service
          .from("matches")
          .select("*")
          .eq("external_id", item.row.external_id)
          .maybeSingle();
        if (lookupError) {
          failed.push({ external_id: item.row.external_id, error: lookupError.message });
          return;
        }
        if (existing && existing.home_team === item.row.home_team &&
          existing.away_team === item.row.away_team &&
          existing.competition === item.row.competition &&
          existing.match_date === item.row.match_date &&
          existing.kickoff_time === item.row.kickoff_time) {
          applied.push({ external_id: item.row.external_id, sourceRow: item.candidate.retainedSourceRow, result: item.candidate.result });
          return;
        }
        if (existing) {
          failed.push({ external_id: item.row.external_id, error: "A match with this external ID already exists but its metadata differs; it was not overwritten." });
          return;
        }
      }
      failed.push({
        external_id: item.row.external_id,
        error: error.message || fallbackError || "Unable to insert match.",
      });
    }

    for (let index = 0; index < inserts.length; index += BATCH_SIZE) {
      const batch = inserts.slice(index, index + BATCH_SIZE);
      const { error } = await service.from("matches").insert(batch.map((item) => item.row));
      if (error) {
        for (const item of batch) await insertOne(item, error.message);
        continue;
      }
      const ids = batch.map((item) => item.row.external_id);
      const { data: verified, error: verifyError } = await service.from("matches").select("*").in("external_id", ids);
      if (verifyError) {
        for (const item of batch) await verifyInserted(item);
        continue;
      }
      const verifiedById = new Map((verified ?? []).map((match) => [match.external_id, match as MatchRow]));
      for (const item of batch) {
        const actual = verifiedById.get(item.row.external_id);
        if (!actual || actual.home_team !== item.row.home_team || actual.away_team !== item.row.away_team ||
          actual.competition !== item.row.competition || actual.match_date !== item.row.match_date ||
          actual.kickoff_time !== item.row.kickoff_time) {
          failed.push({ external_id: item.row.external_id, error: "Inserted row failed field verification." });
        } else {
          applied.push({ external_id: item.row.external_id, sourceRow: item.candidate.retainedSourceRow, result: item.candidate.result });
        }
      }
    }
    const finalMatches = await fetchAllMatches(service);
    const counts = new Map<string, number>();
    for (const match of finalMatches) counts.set(match.external_id, (counts.get(match.external_id) ?? 0) + 1);
    const duplicateExternalIds = [...counts.entries()].filter(([, count]) => count > 1).map(([external_id]) => external_id);
    const failedSample = failed.slice(0, 20);
    const failedByError = failed.reduce<Record<string, number>>((acc, item) => {
      acc[item.error] = (acc[item.error] ?? 0) + 1;
      return acc;
    }, {});
    return NextResponse.json({
      candidates: plan.candidates.length,
      applied: applied.length,
      blocked: plan.blockedDuplicateConflicts.length,
      invalidMetadata: invalidRows.length,
      failed: failed.length,
      partial: failed.length > 0 && applied.length > 0,
      retryable: failed.length > 0,
      retryGuidance: failed.length > 0 ? "Refresh the preview, review failed rows, then retry Apply. Already inserted rows are verified and will not be overwritten." : null,
      blockedDuplicateConflicts: plan.blockedDuplicateConflicts,
      duplicateExactDeduped: applied.filter((item) => item.result === "DUPLICATE_EXACT_DEDUPED"),
      appliedRows: applied,
      failedRows: failed,
      failedSample,
      failedByError,
      verified: applied.length,
      duplicateExternalIds,
      finalMatchCount: finalMatches.length,
    });
  } catch (error) {
    console.error("Match Master apply failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to apply Match Master records." }, { status: 500 });
  } finally {
    await releaseMatchMasterSyncLock(lock);
  }
}

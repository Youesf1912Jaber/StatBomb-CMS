import "server-only";

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatchMasterPreviewRow } from "@/lib/sync/google-sheets";
import { normalizeMatchId } from "@/lib/sync/google-sheets";
import type { Database, MatchRow } from "@/types/database.types";

const MATCHES_PAGE_SIZE = 1000;

type MatchMasterPreviewMatch = Pick<MatchRow, "external_id" | "home_team" | "away_team" | "competition" | "match_date" | "kickoff_time">;

export async function fetchAllMatches(client: SupabaseClient<Database>): Promise<MatchMasterPreviewMatch[]> {
  const rows: MatchMasterPreviewMatch[] = [];
  for (let from = 0; ; from += MATCHES_PAGE_SIZE) {
    const { data, error } = await client
      .from("matches")
      .select("external_id, home_team, away_team, competition, match_date, kickoff_time")
      .order("external_id", { ascending: true })
      .range(from, from + MATCHES_PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < MATCHES_PAGE_SIZE) break;
  }
  return rows;
}

export function findMatchByExternalId(matches: MatchMasterPreviewMatch[], matchId: string | null | undefined): MatchRow | undefined {
  const normalized = normalizeMatchId(matchId);
  if (!normalized) return undefined;
  return matches.find((match) => normalizeMatchId(match.external_id) === normalized);
}

export type MatchMasterPreviewResult =
  | "NEW_MATCH"
  | "EXISTING_UNCHANGED"
  | "EXISTING_DIFFERENT"
  | "DUPLICATE_MATCH_MASTER"
  | "INVALID_MATCH_ID";

export type MatchMasterPreviewRowResult = {
  sourceRow: number;
  matchId: string;
  rawMatchId: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  competition: string | null;
  season: string | null;
  matchDate: string | null;
  kickoff: string | null;
  result: MatchMasterPreviewResult;
  reason: string;
  duplicateRows: number[];
};

export type MatchMasterPreviewSummary = {
  totalSourceRows: number;
  validMatchIds: number;
  uniqueMatchIds: number;
  blankMatchIds: number;
  invalidMatchIds: number;
  newMatches: number;
  existingUnchanged: number;
  existingDifferent: number;
  duplicateMatchMasterRows: number;
  duplicateMatchMasterGroups: number;
};

export type MatchMasterApplyCandidate = {
  source: MatchMasterPreviewRow;
  result: "NEW_MATCH" | "DUPLICATE_EXACT_DEDUPED";
  retainedSourceRow: number;
};

export type MatchMasterApplyPlan = {
  candidates: MatchMasterApplyCandidate[];
  blockedDuplicateConflicts: MatchMasterPreviewRowResult[];
  invalidMetadata: MatchMasterPreviewRowResult[];
};

export function normalizeMatchMasterDate(value: string | null): string | null {
  const text = value?.trim() ?? "";
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const dot = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  const [, isoYear, isoMonth, isoDay] = iso ?? [];
  const [, slashMonth, slashDay, slashYear] = slash ?? [];
  const [, dotDay, dotMonth, dotYear] = dot ?? [];
  const year = isoYear ?? slashYear ?? dotYear;
  const month = isoMonth ?? slashMonth ?? dotMonth;
  const day = isoDay ?? slashDay ?? dotDay;
  if (!year || !month || !day) return text.toLowerCase();
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function normalizeTime(value: string | null): string | null {
  const text = value?.trim() ?? "";
  if (!text) return null;
  const match = text.match(/(?:^|\s|-)(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([AP]M))?(?:$|\s)/i);
  if (!match) return text.toLowerCase();
  let hour = Number(match[1]);
  const meridiem = match[4]?.toUpperCase();
  if (meridiem === "AM" && hour === 12) hour = 0;
  if (meridiem === "PM" && hour < 12) hour += 12;
  return `${String(hour).padStart(2, "0")}:${match[2]}:${match[3] ?? "00"}`;
}

export function normalizeMatchMasterKickoff(value: string | null): string | null {
  const text = value?.trim() ?? "";
  if (!text) return null;
  const isoTime = text.match(/T(\d{2}:\d{2}(?::\d{2})?)/);
  return normalizeTime(isoTime?.[1] ?? text);
}

function sameNullableText(left: string | null, right: string | null): boolean {
  return (left ?? "").trim().toLowerCase() === (right ?? "").trim().toLowerCase();
}

function mappedFieldsMatch(source: MatchMasterPreviewRow, existing: MatchRow): boolean {
  return sameNullableText(source.home_team, existing.home_team) &&
    sameNullableText(source.away_team, existing.away_team) &&
    sameNullableText(source.competition_name, existing.competition) &&
    normalizeMatchMasterDate(source.match_date) === normalizeMatchMasterDate(existing.match_date) &&
    normalizeMatchMasterKickoff(source.kick_off_time) === normalizeMatchMasterKickoff(existing.kickoff_time);
}

function sourceSignature(source: MatchMasterPreviewRow): string {
  return [
    normalizeMatchMasterDate(source.match_date),
    normalizeMatchMasterKickoff(source.kick_off_time),
    source.home_team?.trim().toLowerCase() ?? "",
    source.away_team?.trim().toLowerCase() ?? "",
    source.competition_name?.trim().toLowerCase() ?? "",
    source.season_name?.trim().toLowerCase() ?? "",
  ].join("|");
}

export function classifyMatchMasterRows(
  sourceRows: MatchMasterPreviewRow[],
  matches: MatchRow[],
): { rows: MatchMasterPreviewRowResult[]; summary: MatchMasterPreviewSummary } {
  const grouped = new Map<string, MatchMasterPreviewRow[]>();
  for (const source of sourceRows) {
    if (!source.match_id_valid) continue;
    const key = normalizeMatchId(source.match_id);
    if (!key) continue;
    const group = grouped.get(key) ?? [];
    group.push(source);
    grouped.set(key, group);
  }
  const existingByExternalId = new Map(
    matches.map((match) => [normalizeMatchId(match.external_id) ?? match.external_id, match]),
  );
  const resultRows = sourceRows.map((source) => {
    const matchId = normalizeMatchId(source.match_id) ?? "";
    const duplicateGroup = matchId ? grouped.get(matchId) ?? [] : [];
    const duplicateRows = duplicateGroup.length > 1 ? duplicateGroup.map((item) => item.source_row) : [];
    let result: MatchMasterPreviewResult;
    let reason: string;
    if (!source.match_id_valid) {
      result = "INVALID_MATCH_ID";
      reason = source.raw_match_id ? "Match ID is not a valid numeric identifier." : "Match ID is blank.";
    } else if (duplicateRows.length > 0) {
      result = "DUPLICATE_MATCH_MASTER";
      const exact = new Set(duplicateGroup.map(sourceSignature)).size === 1;
      reason = exact
        ? `Match ID appears in duplicate identical source rows: ${duplicateRows.join(", ")}.`
        : `Match ID appears in source rows with conflicting metadata: ${duplicateRows.join(", ")}.`;
    } else {
      const existing = existingByExternalId.get(matchId);
      if (!existing) {
        result = "NEW_MATCH";
        reason = "Match ID does not exist in Supabase matches.";
      } else if (mappedFieldsMatch(source, existing)) {
        result = "EXISTING_UNCHANGED";
        reason = "Mapped Match Master fields match the Supabase row.";
      } else {
        result = "EXISTING_DIFFERENT";
        reason = "One or more mapped Match Master fields differ from Supabase.";
      }
    }
    return {
      sourceRow: source.source_row,
      matchId,
      rawMatchId: source.raw_match_id,
      homeTeam: source.home_team,
      awayTeam: source.away_team,
      competition: source.competition_name,
      season: source.season_name,
      matchDate: source.match_date,
      kickoff: source.kick_off_time,
      result,
      reason,
      duplicateRows,
    };
  });
  const duplicateGroups = new Set(resultRows.filter((row) => row.result === "DUPLICATE_MATCH_MASTER").map((row) => row.matchId));
  const summary = resultRows.reduce<MatchMasterPreviewSummary>((acc, row) => {
    acc.totalSourceRows += 1;
    if (row.result === "INVALID_MATCH_ID") {
      if (row.rawMatchId) acc.invalidMatchIds += 1;
      else acc.blankMatchIds += 1;
    } else {
      acc.validMatchIds += 1;
    }
    if (row.result === "NEW_MATCH") acc.newMatches += 1;
    if (row.result === "EXISTING_UNCHANGED") acc.existingUnchanged += 1;
    if (row.result === "EXISTING_DIFFERENT") acc.existingDifferent += 1;
    if (row.result === "DUPLICATE_MATCH_MASTER") acc.duplicateMatchMasterRows += 1;
    return acc;
  }, {
    totalSourceRows: 0, validMatchIds: 0, uniqueMatchIds: grouped.size,
    blankMatchIds: 0, invalidMatchIds: 0, newMatches: 0,
    existingUnchanged: 0, existingDifferent: 0, duplicateMatchMasterRows: 0,
    duplicateMatchMasterGroups: duplicateGroups.size,
  });
  return { rows: resultRows, summary };
}

export function buildMatchMasterApplyPlan(
  sourceRows: MatchMasterPreviewRow[],
  matches: MatchRow[],
): MatchMasterApplyPlan {
  const preview = classifyMatchMasterRows(sourceRows, matches);
  const byMatchId = new Map<string, MatchMasterPreviewRow[]>();
  for (const source of sourceRows) {
    const matchId = normalizeMatchId(source.match_id);
    if (!source.match_id_valid || !matchId) continue;
    const group = byMatchId.get(matchId) ?? [];
    group.push(source);
    byMatchId.set(matchId, group);
  }
  const blockedDuplicateConflicts: MatchMasterPreviewRowResult[] = [];
  const invalidMetadata: MatchMasterPreviewRowResult[] = [];
  const candidates: MatchMasterApplyCandidate[] = [];
  for (const row of preview.rows) {
    if (row.result === "DUPLICATE_MATCH_MASTER") {
      const group = byMatchId.get(row.matchId) ?? [];
      const signatures = new Set(group.map(sourceSignature));
      if (signatures.size > 1) blockedDuplicateConflicts.push(row);
      continue;
    }
    if (row.result !== "NEW_MATCH") continue;
    const source = sourceRows.find((candidate) => candidate.source_row === row.sourceRow);
    if (!source || !source.home_team || !source.away_team || !normalizeMatchMasterDate(source.match_date) || !normalizeMatchMasterKickoff(source.kick_off_time)) {
      invalidMetadata.push(row);
      continue;
    }
    candidates.push({ source, result: "NEW_MATCH", retainedSourceRow: source.source_row });
  }
  for (const [matchId, group] of byMatchId) {
    if (group.length < 2 || new Set(group.map(sourceSignature)).size !== 1) continue;
    const retained = [...group].sort((left, right) => left.source_row - right.source_row)[0];
    if (!retained) continue;
    const existing = matches.find((match) => normalizeMatchId(match.external_id) === matchId);
    if (existing) continue;
    if (!retained.home_team || !retained.away_team || !normalizeMatchMasterDate(retained.match_date) || !normalizeMatchMasterKickoff(retained.kick_off_time)) {
      const previewRow = preview.rows.find((row) => row.sourceRow === retained.source_row);
      if (previewRow) invalidMetadata.push(previewRow);
      continue;
    }
    candidates.push({ source: retained, result: "DUPLICATE_EXACT_DEDUPED", retainedSourceRow: retained.source_row });
  }
  return { candidates, blockedDuplicateConflicts, invalidMetadata };
}

export function createMatchMasterPreviewFingerprint(
  sourceRows: MatchMasterPreviewRow[],
  matches: MatchRow[],
): string {
  const payload = JSON.stringify({
    sourceRows,
    matches: matches.map((match) => ({
      external_id: match.external_id,
      home_team: match.home_team,
      away_team: match.away_team,
      competition: match.competition,
      match_date: match.match_date,
      kickoff_time: match.kickoff_time,
    })),
  });
  return createHash("sha256").update(payload).digest("hex");
}

import "server-only";

import { normalizeMatchId, readMatchesMasterSheet } from "@/lib/sync/google-sheets";

export type MatchMasterMetadata = {
  competition: string | null;
  country: string | null;
};

export async function getMatchMasterMetadataMap(): Promise<Map<string, MatchMasterMetadata>> {
  const rows = await readMatchesMasterSheet();
  const metadata = new Map<string, MatchMasterMetadata>();
  for (const row of rows) {
    const matchId = normalizeMatchId(row.match_id);
    if (!matchId) continue;
    metadata.set(matchId, {
      competition: row.competition_name?.trim() || null,
      country: row.country?.trim() || null,
    });
  }
  return metadata;
}

export async function getMatchMasterMetadata(matchId: string | null | undefined): Promise<MatchMasterMetadata> {
  try {
    const normalized = normalizeMatchId(matchId);
    if (!normalized) return { competition: null, country: null };
    const metadata = await getMatchMasterMetadataMap();
    return metadata.get(normalized) ?? { competition: null, country: null };
  } catch {
    // Match pages should remain usable even when the source sheet is temporarily unavailable.
    return { competition: null, country: null };
  }
}

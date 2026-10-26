import "server-only";

import { unstable_cache } from "next/cache";
import { normalizeMatchId, readMatchesMasterSheet } from "@/lib/sync/google-sheets";

export type MatchMasterMetadata = {
  competition: string | null;
  country: string | null;
};

/**
 * Match Master metadata changes infrequently compared with dashboard visits.
 * Cache only the shared, non-sensitive source rows; do not cache assignments,
 * statuses, notifications, or any user-scoped data here.
 *
 * A short revalidation window keeps the Collector dashboard from requesting
 * the full Google Sheet on every navigation while still picking up edits
 * without a manual deployment.
 */
const getCachedMatchMasterRows = unstable_cache(
  async () => readMatchesMasterSheet(),
  ["match-master-metadata-rows-v1"],
  { revalidate: 300 }
);

export async function getMatchMasterMetadataMap(): Promise<Map<string, MatchMasterMetadata>> {
  const rows = await getCachedMatchMasterRows();
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

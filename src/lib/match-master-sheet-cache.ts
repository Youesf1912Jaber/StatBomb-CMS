import "server-only";

import { unstable_cache } from "next/cache";
import { readMatchesMasterSheet } from "@/lib/sync/google-sheets";

/**
 * Match Master is a shared, non-sensitive source. Cache the sheet rows briefly
 * so opening an ETA day does not call Google Sheets a second time. Distribution
 * state is never cached here and remains queried live from Supabase.
 */
export const getCachedMatchMasterRows = unstable_cache(
  async () => readMatchesMasterSheet(),
  ["match-master-source-rows-v1"],
  { revalidate: 60 }
);

import "server-only";

import { resolveHyperCareSections, type HyperCareTeamSection } from "./parse";
import { readHyperCareCatalog } from "./sheet";

export async function getHyperCareForMatch(
  homeTeam: string | null | undefined,
  awayTeam: string | null | undefined
): Promise<HyperCareTeamSection[]> {
  try {
    const catalog = await readHyperCareCatalog();
    return resolveHyperCareSections(homeTeam, awayTeam, catalog);
  } catch {
    return [];
  }
}

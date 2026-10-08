import {
  loadCollectorScorecard,
  requireScorecardCollector,
  scorecardErrorResponse,
  scorecardJsonResponse,
} from "@/lib/scorecard/api";

export const runtime = "nodejs";

export async function GET() {
  const access = await requireScorecardCollector();
  if (!access.ok) return access.response;

  try {
    return scorecardJsonResponse(await loadCollectorScorecard(access.hr_code));
  } catch (error) {
    return scorecardErrorResponse(error, "Unable to read Scorecard.");
  }
}

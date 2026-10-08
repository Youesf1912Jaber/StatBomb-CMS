import { loadAdminScorecard, requireScorecardAdmin, scorecardErrorResponse, scorecardJsonResponse } from "@/lib/scorecard/api";

export const runtime = "nodejs";

export async function GET() {
  const access = await requireScorecardAdmin();
  if (!access.ok) return access.response;

  try {
    return scorecardJsonResponse(await loadAdminScorecard());
  } catch (error) {
    return scorecardErrorResponse(error, "Unable to read Scorecard.");
  }
}

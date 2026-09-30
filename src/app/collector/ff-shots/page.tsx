import { FfShotsTable } from "@/components/FfShotsTable";
import { RefreshFfShotsButton } from "@/components/RefreshFfShotsButton";
import { getFfShotsForHrCode } from "@/lib/ff-shots/queries";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export default async function CollectorFfShotsPage() {
  const profile = await getProfileOrRedirect();
  const supabase = createClient();
  const shots = await getFfShotsForHrCode(supabase, profile.hr_code);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl text-chalk-50">My FF Shots</h1>
          <p className="mt-1 text-sm text-chalk-200">
            Only FF shots matching your HR-Code. Refresh reads FF - Shots 2026 through the server and never writes to the sheet.
          </p>
        </div>
        <RefreshFfShotsButton endpoint="/api/collector/ff-shots/refresh" />
      </div>
      {!profile.hr_code && (
        <p className="rounded-card border border-pitch-700 bg-pitch-900 px-4 py-3 text-sm text-chalk-200">
          No HR-Code is set on this account, so no FF shots can be matched.
        </p>
      )}
      <p className="text-sm text-chalk-200">Your FF shots: {shots.length}</p>
      <FfShotsTable shots={shots} />
    </div>
  );
}

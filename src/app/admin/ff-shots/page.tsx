import { redirect } from "next/navigation";
import { FfShotsTable } from "@/components/FfShotsTable";
import { RefreshFfShotsButton } from "@/components/RefreshFfShotsButton";
import { getAllFfShots } from "@/lib/ff-shots/queries";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export default async function AdminFfShotsPage() {
  const profile = await getProfileOrRedirect();
  if (profile.role !== "admin") {
    redirect("/collector");
  }

  const supabase = createClient();
  const shots = await getAllFfShots(supabase);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl text-chalk-50">FF Shots</h1>
          <p className="mt-1 text-sm text-chalk-200">
            Read-only synchronized copy of FF - Shots 2026. Refresh reads the official sheet and never writes back.
          </p>
        </div>
        <RefreshFfShotsButton endpoint="/api/admin/ff-shots/refresh" />
      </div>
      <p className="text-sm text-chalk-200">Total FF shots: {shots.length}</p>
      <FfShotsTable shots={shots} />
    </div>
  );
}

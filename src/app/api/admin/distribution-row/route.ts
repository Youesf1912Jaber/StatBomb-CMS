import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { deleteDistributionRowFromSheet, DistributionRowConflictError } from "@/lib/sync/google-sheets";
import { PreviewInputError } from "@/lib/sync/preview";

export const runtime = "nodejs";

export async function DELETE(request: Request) {
  try {
    const profile = await getProfileOrRedirect();
    if (profile.role !== "admin") {
      return NextResponse.json({ success: false, error: "Admin access required." }, { status: 403 });
    }

    const body = await request.json().catch(() => null) as { assignmentId?: string } | null;
    const assignmentId = body?.assignmentId?.trim();
    if (!assignmentId) {
      return NextResponse.json({ success: false, error: "Assignment ID is required." }, { status: 422 });
    }

    const supabase = createClient();
    const { data: assignment, error: assignmentError } = await supabase
      .from("assignments")
      .select("id, match_id, collector_id, task, half, distribution_present")
      .eq("id", assignmentId)
      .maybeSingle();
    if (assignmentError) throw assignmentError;
    if (!assignment || !assignment.distribution_present) {
      return NextResponse.json({ success: false, error: "This assignment is no longer present in Distribution. Refresh the dashboard." }, { status: 409 });
    }

    const [{ data: match, error: matchError }, { data: collector, error: collectorError }] = await Promise.all([
      supabase.from("matches").select("external_id").eq("id", assignment.match_id).maybeSingle(),
      supabase.from("profiles").select("hr_code").eq("id", assignment.collector_id).maybeSingle(),
    ]);
    if (matchError) throw matchError;
    if (collectorError) throw collectorError;
    if (!match?.external_id || !collector?.hr_code) {
      return NextResponse.json({ success: false, error: "Could not safely identify this collector's row in the Distribution sheet." }, { status: 422 });
    }

    const deleted = await deleteDistributionRowFromSheet({
      matchId: match.external_id,
      collectorHrCode: collector.hr_code,
      task: assignment.task,
      half: assignment.half,
    });

    // Preserve the assignment and its history; only mark that its source row is gone.
    const serviceClient = createServiceRoleClient();
    const { error: updateError } = await serviceClient
      .from("assignments")
      .update({ distribution_present: false })
      .eq("id", assignment.id);
    if (updateError) {
      console.error("Distribution row deleted but assignment presence update failed", updateError);
      return NextResponse.json({
        success: false,
        error: "The row was deleted from Google Sheets, but the dashboard state could not be updated. Run Refresh Distribution.",
      }, { status: 500 });
    }

    revalidatePath("/admin");
    revalidatePath("/admin/assignments");
    revalidatePath("/collector");
    return NextResponse.json({ success: true, deletedRow: deleted.rowNumber });
  } catch (error) {
    console.error("Admin Distribution row deletion failed", error);
    const message = error instanceof PreviewInputError
      ? error.safeMessage
      : "The Distribution row could not be deleted.";
    const status = error instanceof DistributionRowConflictError ? 409 : error instanceof PreviewInputError ? 422 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

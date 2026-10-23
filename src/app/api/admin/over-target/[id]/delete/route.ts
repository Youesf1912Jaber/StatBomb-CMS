import { NextResponse } from "next/server";
import { PreviewInputError } from "@/lib/sync/preview";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { deleteOverTargetSheetRow } from "@/lib/over-target/sheet";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const service = createServiceRoleClient();
    const { data: record, error: readError } = await service
      .from("over_target")
      .select("id, source, source_present, sheet_row_number, match_external_id, week_date, week_date_raw, hr_code, count_value")
      .eq("id", id)
      .maybeSingle();
    if (readError) throw readError;
    if (!record || !record.source_present) {
      return NextResponse.json({ error: "This Over Target record is no longer present in the sheet." }, { status: 404 });
    }
    if (record.source !== "google_sheet") {
      return NextResponse.json({ error: "Only records imported from Google Sheets can be deleted with this action." }, { status: 409 });
    }

    const result = await deleteOverTargetSheetRow(record);
    const { error: updateError } = await service
      .from("over_target")
      .update({ source_present: false, last_synced_at: new Date().toISOString() })
      .eq("id", record.id);
    if (updateError) throw updateError;

    return NextResponse.json({ success: true, deletedRow: result.deletedRow });
  } catch (error) {
    console.error("Over Target sheet row deletion failed", error);
    const message = error instanceof PreviewInputError ? error.safeMessage : "Unable to delete this row from Google Sheets.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

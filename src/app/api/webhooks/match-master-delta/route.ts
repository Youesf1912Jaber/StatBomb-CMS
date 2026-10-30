import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeltaPayload = {
  sheetName?: string;
  sourceRow?: number;
  values?: unknown[];
  editedAt?: string;
};

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.MATCH_MASTER_DELTA_WEBHOOK_SECRET;
  const suppliedSecret = request.headers.get("x-match-master-secret");
  if (!expectedSecret || !suppliedSecret || suppliedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized webhook." }, { status: 401 });
  }

  let payload: DeltaPayload;
  try {
    payload = await request.json() as DeltaPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  if (!Number.isSafeInteger(payload.sourceRow) || (payload.sourceRow ?? 0) < 2 ||
      !Array.isArray(payload.values) || payload.values.length > 22) {
    return NextResponse.json({ error: "Invalid Match Master row payload." }, { status: 400 });
  }

  const values = payload.values.map((value) => String(value ?? ""));
  const isDeleted = values.every((value) => value.trim() === "");
  const editedAt = payload.editedAt && Number.isFinite(Date.parse(payload.editedAt))
    ? new Date(payload.editedAt).toISOString()
    : new Date().toISOString();

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("match_master_sheet_delta").upsert({
    source_row: payload.sourceRow,
    row_values: values,
    is_deleted: isDeleted,
    edited_at: editedAt,
    received_at: new Date().toISOString(),
  }, { onConflict: "source_row" });

  if (error) {
    console.error("Match Master delta webhook write failed", error);
    return NextResponse.json({ error: "Unable to save Match Master row change." }, { status: 500 });
  }

  return NextResponse.json({ success: true, sourceRow: payload.sourceRow });
}

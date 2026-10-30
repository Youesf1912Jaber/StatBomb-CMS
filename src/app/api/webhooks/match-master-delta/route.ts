import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeltaPayload = {
  sheetName?: string;
  sourceRow?: number;
  headers?: string[];
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

  const sourceRow = payload.sourceRow;
  if (typeof sourceRow !== "number" || !Number.isSafeInteger(sourceRow) || sourceRow < 2 ||
      !Array.isArray(payload.headers) || !Array.isArray(payload.values) ||
      payload.headers.length !== payload.values.length || payload.headers.length > 22) {
    return NextResponse.json({ error: "Invalid Match Master row payload." }, { status: 400 });
  }

  const rowValues = Object.fromEntries(payload.headers.map((header, index) => [
    String(header ?? "").trim(),
    String(payload.values?.[index] ?? ""),
  ]));
  const isDeleted = Object.values(rowValues).every((value) => String(value).trim() === "");
  const editedAt = payload.editedAt && Number.isFinite(Date.parse(payload.editedAt))
    ? new Date(payload.editedAt).toISOString()
    : new Date().toISOString();

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("match_master_sheet_delta").upsert({
    source_row: sourceRow,
    row_values: rowValues,
    is_deleted: isDeleted,
    edited_at: editedAt,
    received_at: new Date().toISOString(),
  }, { onConflict: "source_row" });

  if (error) {
    console.error("Match Master delta webhook write failed", error);
    return NextResponse.json({ error: "Unable to save Match Master row change." }, { status: 500 });
  }

  return NextResponse.json({ success: true, sourceRow });
}

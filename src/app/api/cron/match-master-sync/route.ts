import { NextResponse } from "next/server";
import { syncMatchMasterCache } from "@/lib/match-master-cache-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.MATCH_MASTER_CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await syncMatchMasterCache();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Scheduled Match Master cache sync failed", error);
    return NextResponse.json({ error: "Match Master cache sync failed." }, { status: 500 });
  }
}

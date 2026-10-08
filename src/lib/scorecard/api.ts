import "server-only";

import { NextResponse } from "next/server";
import { PreviewInputError } from "@/lib/sync/preview";
import { createClient } from "@/lib/supabase/server";
import {
  adminScorecardPayload,
  collectorScorecardPayload,
  resolveScorecardAdminAccess,
  resolveScorecardCollectorAccess,
  type ScorecardApiPayload,
  type ScorecardAuthFailure,
} from "./access";
import { readScorecardSheet } from "./sheet";

export {
  adminScorecardPayload,
  canonicalizeScorecardHrCode,
  collectorScorecardPayload,
  filterScorecardRowsForHrCode,
  resolveScorecardAdminAccess,
  resolveScorecardCollectorAccess,
} from "./access";
export type {
  ScorecardAdminAccess,
  ScorecardApiPayload,
  ScorecardAuthFailure,
  ScorecardCollectorAccess,
} from "./access";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

export function scorecardJsonResponse(payload: ScorecardApiPayload): NextResponse {
  return NextResponse.json(payload, { headers: NO_STORE_HEADERS });
}

export function scorecardAuthResponse(access: ScorecardAuthFailure): NextResponse {
  return NextResponse.json({ error: access.error }, { status: access.status, headers: NO_STORE_HEADERS });
}

export function scorecardErrorResponse(error: unknown, fallback: string): NextResponse {
  console.error(fallback, error);
  const message = error instanceof PreviewInputError ? error.safeMessage : fallback;
  const status = error instanceof PreviewInputError ? 422 : 500;
  return NextResponse.json({ error: message }, { status, headers: NO_STORE_HEADERS });
}

export async function requireScorecardAdmin(): Promise<
  { ok: true } | { ok: false; response: NextResponse }
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };
  const access = resolveScorecardAdminAccess(user, profile);
  if (!access.ok) {
    return { ok: false, response: scorecardAuthResponse(access) };
  }
  return access;
}

export async function requireScorecardCollector(): Promise<
  { ok: true; hr_code: string | null } | { ok: false; response: NextResponse }
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role, hr_code").eq("id", user.id).single()
    : { data: null };
  const access = resolveScorecardCollectorAccess(user, profile);
  if (!access.ok) {
    return { ok: false, response: scorecardAuthResponse(access) };
  }
  return access;
}

export async function loadAdminScorecard(): Promise<ScorecardApiPayload> {
  return adminScorecardPayload(await readScorecardSheet());
}

export async function loadCollectorScorecard(hrCode: string | null | undefined): Promise<ScorecardApiPayload> {
  return collectorScorecardPayload(await readScorecardSheet(), hrCode);
}

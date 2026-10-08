import "server-only";

import { NextResponse } from "next/server";
import { PreviewInputError } from "@/lib/sync/preview";
import { createClient } from "@/lib/supabase/server";
import { linksPayload, resolveLinksAccess, type LinksAuthFailure } from "./access";
import { readLinksSheet } from "./sheet";
import type { LinksApiPayload } from "./types";

export { linksPayload, resolveLinksAccess } from "./access";
export type { LinksAccess, LinksAuthFailure } from "./access";
export type { LinksApiPayload } from "./types";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

export function linksJsonResponse(payload: LinksApiPayload): NextResponse {
  return NextResponse.json(payload, { headers: NO_STORE_HEADERS });
}

export function linksAuthResponse(access: LinksAuthFailure): NextResponse {
  return NextResponse.json({ error: access.error }, { status: access.status, headers: NO_STORE_HEADERS });
}

export function linksErrorResponse(error: unknown, fallback: string): NextResponse {
  console.error(fallback, error);
  const message = error instanceof PreviewInputError ? error.safeMessage : fallback;
  const status = error instanceof PreviewInputError ? 422 : 500;
  return NextResponse.json({ error: message }, { status, headers: NO_STORE_HEADERS });
}

export async function requireLinksAccess(): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };
  const access = resolveLinksAccess(user, profile);
  if (!access.ok) {
    return { ok: false, response: linksAuthResponse(access) };
  }
  return access;
}

export async function loadLinks(): Promise<LinksApiPayload> {
  return linksPayload(await readLinksSheet());
}

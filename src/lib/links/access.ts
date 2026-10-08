import type { LinksApiPayload, LinksSheetData } from "./types";

export type LinksAuthFailure = {
  ok: false;
  status: 401 | 403;
  error: string;
};

export type LinksAccess = { ok: true } | LinksAuthFailure;

export function resolveLinksAccess(
  user: { id: string } | null | undefined,
  profile: { role?: string | null } | null | undefined
): LinksAccess {
  if (!user) {
    return { ok: false, status: 401, error: "Authentication required." };
  }
  if (profile?.role !== "admin" && profile?.role !== "collector") {
    return { ok: false, status: 403, error: "Links access required." };
  }
  return { ok: true };
}

export function linksPayload(data: LinksSheetData): LinksApiPayload {
  return { cells: data.cells };
}

import type { ScorecardRow, ScorecardSheetData } from "./types";

export type ScorecardAuthFailure = {
  ok: false;
  status: 401 | 403;
  error: string;
};

export type ScorecardAdminAccess = { ok: true } | ScorecardAuthFailure;

export type ScorecardCollectorAccess =
  | { ok: true; hr_code: string | null }
  | ScorecardAuthFailure;

export type ScorecardApiPayload = {
  headers: string[];
  rows: ScorecardRow[];
};

export function canonicalizeScorecardHrCode(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u200b-\u200f\u202a-\u202e]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function resolveScorecardAdminAccess(
  user: { id: string } | null | undefined,
  profile: { role?: string | null } | null | undefined
): ScorecardAdminAccess {
  if (!user) {
    return { ok: false, status: 401, error: "Authentication required." };
  }
  if (profile?.role !== "admin") {
    return { ok: false, status: 403, error: "Admin access required." };
  }
  return { ok: true };
}

export function resolveScorecardCollectorAccess(
  user: { id: string } | null | undefined,
  profile: { role?: string | null; hr_code?: string | null } | null | undefined
): ScorecardCollectorAccess {
  if (!user) {
    return { ok: false, status: 401, error: "Authentication required." };
  }
  if (profile?.role !== "collector" && profile?.role !== "admin") {
    return { ok: false, status: 403, error: "Collector access required." };
  }
  return { ok: true, hr_code: profile.hr_code ?? null };
}

export function filterScorecardRowsForHrCode(
  rows: ScorecardRow[],
  hrCode: string | null | undefined
): ScorecardRow[] {
  const normalized = canonicalizeScorecardHrCode(hrCode);
  if (!normalized) return [];
  return rows.filter((row) => canonicalizeScorecardHrCode(row.identity.hr_code) === normalized);
}

export function collectorScorecardPayload(
  data: ScorecardSheetData,
  hrCode: string | null | undefined
): ScorecardApiPayload {
  return {
    headers: data.headers,
    rows: filterScorecardRowsForHrCode(data.rows, hrCode),
  };
}

export function adminScorecardPayload(data: ScorecardSheetData): ScorecardApiPayload {
  return {
    headers: data.headers,
    rows: data.rows,
  };
}

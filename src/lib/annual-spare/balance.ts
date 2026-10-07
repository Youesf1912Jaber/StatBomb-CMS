import type { AnnualLeaveAction, AnnualLeaveType } from "../../types/database.types";
import type { AnnualSpareRow } from "./parse";

export type LedgerUsageInput = {
  hr_code: string;
  leave_type: AnnualLeaveType;
  action: AnnualLeaveAction;
};

export type AnnualSpareBalance = {
  hr_code: string;
  name: string | null;
  total_available: number | null;
  available_al_r: number | null;
  available_al_c: number | null;
  used_al_r: number;
  used_al_c: number;
  used: number;
  remaining: number | null;
  remaining_al_r: number | null;
  remaining_al_c: number | null;
};

export type ActiveLeaveUsage = {
  al_r: number;
  al_c: number;
};

export function normalizeBalanceHrCode(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u200b-\u200f\u202a-\u202e]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function subtractUsage(base: number | null, used: number): number | null {
  if (base === null) return used === 0 ? null : -used;
  return base - used;
}

export function countActiveLeaveUsage(rows: LedgerUsageInput[]): Map<string, ActiveLeaveUsage> {
  const usage = new Map<string, ActiveLeaveUsage>();
  for (const row of rows) {
    if (row.action !== "consume") continue;
    const hrCode = normalizeBalanceHrCode(row.hr_code);
    if (!hrCode) continue;
    const current = usage.get(hrCode) ?? { al_r: 0, al_c: 0 };
    if (row.leave_type === "AL-R") current.al_r += 1;
    if (row.leave_type === "AL-C") current.al_c += 1;
    usage.set(hrCode, current);
  }
  return usage;
}

export function buildAnnualSpareBalances(
  spareRows: AnnualSpareRow[],
  ledgerRows: LedgerUsageInput[]
): AnnualSpareBalance[] {
  const usageByHrCode = countActiveLeaveUsage(ledgerRows);
  const seen = new Set<string>();
  const balances: AnnualSpareBalance[] = [];

  for (const row of spareRows) {
    const hrCode = normalizeBalanceHrCode(row.hr_code);
    if (!hrCode || seen.has(hrCode)) continue;
    seen.add(hrCode);
    const usage = usageByHrCode.get(hrCode) ?? { al_r: 0, al_c: 0 };
    const used = usage.al_r + usage.al_c;
    balances.push({
      hr_code: hrCode,
      name: row.name,
      total_available: row.total_available,
      available_al_r: row.available_al_r,
      available_al_c: row.available_al_c,
      used_al_r: usage.al_r,
      used_al_c: usage.al_c,
      used,
      remaining: subtractUsage(row.total_available, used),
      remaining_al_r: subtractUsage(row.available_al_r, usage.al_r),
      remaining_al_c: subtractUsage(row.available_al_c, usage.al_c),
    });
  }

  return balances;
}

export function findAnnualSpareBalanceForHrCode(
  spareRows: AnnualSpareRow[],
  ledgerRows: LedgerUsageInput[],
  hrCode: string
): AnnualSpareBalance | null {
  const normalized = normalizeBalanceHrCode(hrCode);
  if (!normalized) return null;
  const ownSpare = spareRows.filter((row) => normalizeBalanceHrCode(row.hr_code) === normalized);
  const ownLedger = ledgerRows.filter((row) => normalizeBalanceHrCode(row.hr_code) === normalized);
  return buildAnnualSpareBalances(ownSpare, ownLedger)[0] ?? null;
}

export function filterAnnualSpareBalances(
  rows: AnnualSpareBalance[],
  query: string
): AnnualSpareBalance[] {
  const value = query.trim().toLowerCase();
  if (!value) return rows;
  return rows.filter((row) => {
    const name = (row.name ?? "").toLowerCase();
    return row.hr_code.toLowerCase().includes(value) || name.includes(value);
  });
}

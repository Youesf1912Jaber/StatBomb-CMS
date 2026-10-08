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
};

export function normalizeBalanceHrCode(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u200b-\u200f\u202a-\u202e]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function buildAnnualSpareBalances(
  spareRows: AnnualSpareRow[],
  _ledgerRows: LedgerUsageInput[] = []
): AnnualSpareBalance[] {
  const seen = new Set<string>();
  const balances: AnnualSpareBalance[] = [];

  for (const row of spareRows) {
    const hrCode = normalizeBalanceHrCode(row.hr_code);
    if (!hrCode || seen.has(hrCode)) continue;
    seen.add(hrCode);
    balances.push({
      hr_code: hrCode,
      name: row.name,
      total_available: row.total_available,
      available_al_r: row.available_al_r,
      available_al_c: row.available_al_c,
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
  return buildAnnualSpareBalances(ownSpare, ledgerRows)[0] ?? null;
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

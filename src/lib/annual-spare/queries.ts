import "server-only";

import {
  buildAnnualSpareBalances,
  findAnnualSpareBalanceForHrCode,
  normalizeBalanceHrCode,
  type AnnualSpareBalance,
} from "./balance";
import { readAnnualSpareSheet } from "./sheet";

export async function listAnnualSpareBalances(): Promise<AnnualSpareBalance[]> {
  const spareRows = await readAnnualSpareSheet();
  return buildAnnualSpareBalances(spareRows);
}

export async function getAnnualSpareBalanceForHrCode(
  hrCode: string | null | undefined
): Promise<AnnualSpareBalance | null> {
  const normalized = normalizeBalanceHrCode(hrCode);
  if (!normalized) return null;
  const spareRows = await readAnnualSpareSheet();
  return findAnnualSpareBalanceForHrCode(spareRows, [], normalized);
}

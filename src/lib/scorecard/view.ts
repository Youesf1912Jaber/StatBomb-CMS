import type { ScorecardRow } from "./types";

export const SCORECARD_ALL_MONTHS = "all";

export function displayScorecardCell(value: string | null | undefined): string {
  if (value == null || value.trim() === "") return "—";
  return value;
}

export function distinctScorecardMonths(rows: ScorecardRow[]): string[] {
  const seen = new Set<string>();
  const months: string[] = [];
  for (const row of rows) {
    const month = row.identity.month;
    if (!month || seen.has(month)) continue;
    seen.add(month);
    months.push(month);
  }
  return months;
}

export function filterScorecardRowsByMonth(rows: ScorecardRow[], month: string): ScorecardRow[] {
  if (month === SCORECARD_ALL_MONTHS) return rows;
  return rows.filter((row) => row.identity.month === month);
}

export function resolveScorecardMonthSelection(selectedMonth: string, availableMonths: string[]): string {
  if (selectedMonth === SCORECARD_ALL_MONTHS) return SCORECARD_ALL_MONTHS;
  if (availableMonths.includes(selectedMonth)) return selectedMonth;
  return SCORECARD_ALL_MONTHS;
}

export function scorecardTableCells(headers: string[], rows: ScorecardRow[]): string[][] {
  return rows.map((row) => headers.map((_, index) => displayScorecardCell(row.cells[index] ?? "")));
}

import type {
  ScorecardIdentity,
  ScorecardIdentityIndexes,
  ScorecardRow,
  ScorecardSheetData,
} from "./types";

export class ScorecardParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScorecardParseError";
  }
}

const MONTH_ALIASES = ["month"] as const;
const HR_CODE_ALIASES = ["hr code", "hrcode", "code"] as const;
const NAME_ALIASES = ["name", "collector", "collector name"] as const;
const TEAM_ALIASES = ["team", "team name"] as const;
const TYPE_ALIASES = ["type"] as const;

export const SCORECARD_EMPTY_SHEET_ERROR = "The Scorecard sheet is empty.";
export const SCORECARD_MISSING_IDENTITY_ERROR =
  "The Scorecard sheet is missing required Month, HR Code, Name, Team, or Type headers.";

function cellText(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u200b-\u200f\u202a-\u202e]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function displayScorecardHeader(value: unknown): string {
  return cellText(value);
}

export function normalizeScorecardHeader(value: unknown): string {
  return displayScorecardHeader(value)
    .toLowerCase()
    .replace(/[_./-]+/g, " ")
    .replace(/\s+/g, " ");
}

function formattedCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") {
    return value.replace(/[\u200b-\u200f\u202a-\u202e]/g, "");
  }
  return String(value);
}

function findHeaderIndex(headers: string[], aliases: readonly string[]): number {
  for (let i = 0; i < headers.length; i += 1) {
    const header = headers[i];
    if (header && aliases.includes(header)) return i;
  }
  return -1;
}

export function usedHeaderCount(headerRow: unknown[]): number {
  let last = -1;
  for (let i = 0; i < headerRow.length; i += 1) {
    if (displayScorecardHeader(headerRow[i]) !== "") last = i;
  }
  return last + 1;
}

export function resolveScorecardIdentityIndexes(
  headerRow: unknown[]
): ScorecardIdentityIndexes | null {
  const width = usedHeaderCount(headerRow);
  if (width <= 0) return null;
  const normalized = headerRow.slice(0, width).map((cell) => normalizeScorecardHeader(cell));
  const indexes: ScorecardIdentityIndexes = {
    month: findHeaderIndex(normalized, MONTH_ALIASES),
    hrCode: findHeaderIndex(normalized, HR_CODE_ALIASES),
    name: findHeaderIndex(normalized, NAME_ALIASES),
    team: findHeaderIndex(normalized, TEAM_ALIASES),
    type: findHeaderIndex(normalized, TYPE_ALIASES),
  };
  if (
    indexes.month < 0 ||
    indexes.hrCode < 0 ||
    indexes.name < 0 ||
    indexes.team < 0 ||
    indexes.type < 0
  ) {
    return null;
  }
  return indexes;
}

function identityFromRow(row: unknown[], indexes: ScorecardIdentityIndexes): ScorecardIdentity {
  return {
    month: cellText(row[indexes.month]),
    hr_code: cellText(row[indexes.hrCode]),
    name: cellText(row[indexes.name]),
    team: cellText(row[indexes.team]),
    type: cellText(row[indexes.type]),
  };
}

function cellsForRow(row: unknown[], width: number): string[] {
  const cells: string[] = [];
  for (let i = 0; i < width; i += 1) {
    cells.push(formattedCell(row[i]));
  }
  return cells;
}

function rowHasContent(cells: string[]): boolean {
  return cells.some((cell) => cellText(cell) !== "");
}

export function parseScorecardSheet(matrix: unknown[][]): ScorecardSheetData {
  if (matrix.length === 0) {
    throw new ScorecardParseError(SCORECARD_EMPTY_SHEET_ERROR);
  }

  const headerRow = matrix[0] ?? [];
  const width = usedHeaderCount(headerRow);
  if (width <= 0) {
    throw new ScorecardParseError(SCORECARD_EMPTY_SHEET_ERROR);
  }

  const indexes = resolveScorecardIdentityIndexes(headerRow);
  if (!indexes) {
    throw new ScorecardParseError(SCORECARD_MISSING_IDENTITY_ERROR);
  }

  const headers = headerRow.slice(0, width).map((cell) => displayScorecardHeader(cell));
  const rows: ScorecardRow[] = [];

  for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex] ?? [];
    const cells = cellsForRow(row, width);
    if (!rowHasContent(cells)) continue;
    rows.push({
      identity: identityFromRow(row, indexes),
      cells,
    });
  }

  return { headers, rows };
}

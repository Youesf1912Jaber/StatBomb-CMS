import type { LinksCell, LinksSheetData } from "./types";

export const LINKS_PARSER_CONTRACT = {
  input: "Sheets gridData cells or values matrices: formatted text, optional FORMULA, optional hyperlink metadata",
  cells: "one output cell per non-empty value, in sheet row/column order",
  text: "formatted cell display text, including Arabic, with invisible characters stripped",
  href: "http(s) only, from gridData hyperlink metadata, HYPERLINK() formula, structured href, or URL in text",
  columns: "none; Links is a freeform grid and is not parsed as a headered table",
} as const;

export type LinksGridCellData = {
  formattedValue?: unknown;
  hyperlink?: unknown;
  userEnteredValue?: {
    formulaValue?: unknown;
    stringValue?: unknown;
  };
  textFormatRuns?: Array<{
    format?: {
      link?: {
        uri?: unknown;
      };
    };
  }>;
  userEnteredFormat?: {
    textFormat?: {
      link?: {
        uri?: unknown;
      };
    };
  };
  effectiveFormat?: {
    textFormat?: {
      link?: {
        uri?: unknown;
      };
    };
  };
};

export type LinksStructuredCell = {
  text?: unknown;
  href?: unknown;
};

function cellText(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u200b-\u200f\u202a-\u202e]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isStructuredCell(value: unknown): value is LinksStructuredCell {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  return "text" in value || "href" in value;
}

function displayText(value: unknown): string {
  if (isStructuredCell(value)) {
    return cellText(value.text);
  }
  return cellText(value);
}

function providedHref(value: unknown): string | null {
  if (!isStructuredCell(value)) return null;
  const href = cellText(value.href);
  return href || null;
}

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[.,;:!?)]+$/g, "");
}

function normalizeHref(raw: string): string | null {
  const trimmed = stripTrailingPunctuation(raw.trim());
  if (!trimmed) return null;
  const candidate = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

const URL_PATTERN = /(?:https?:\/\/|(?<![\w:])\/\/)[^\s<>"'）\]]+/gi;

export function extractLinksHref(text: string): string | null {
  const matches = text.match(URL_PATTERN);
  if (!matches) return null;
  for (const match of matches) {
    const href = normalizeHref(match);
    if (href) return href;
  }
  return null;
}

function hrefFromFormula(value: unknown): string | null {
  const formula = String(value ?? "").trim();
  const match =
    formula.match(/^=HYPERLINK\s*\(\s*"([^"]+)"/i) ?? formula.match(/^=HYPERLINK\s*\(\s*'([^']+)'/i);
  const raw = match?.[1];
  if (!raw) return null;
  return normalizeHref(raw) ?? extractLinksHref(raw);
}

function hrefFromCandidate(value: unknown): string | null {
  const text = cellText(value);
  if (!text) return null;
  return normalizeHref(text) ?? extractLinksHref(text);
}

export function hrefFromGridCell(cell: LinksGridCellData | null | undefined): string | null {
  if (!cell) return null;
  const runUris = (cell.textFormatRuns ?? []).map((run) => run.format?.link?.uri);
  // Prefer the hyperlink attached to the actual rich-text run. Google Sheets can
  // expose a cell-level hyperlink that differs from the link attached to its visible
  // text; using the cell-level value first can send users to a different document.
  const candidates = [
    ...runUris,
    cell.hyperlink,
    cell.userEnteredFormat?.textFormat?.link?.uri,
    cell.effectiveFormat?.textFormat?.link?.uri,
  ];
  for (const candidate of candidates) {
    const href = hrefFromCandidate(candidate);
    if (href) return href;
  }
  return null;
}

export function matricesFromGridData(
  rowData: Array<{ values?: LinksGridCellData[] } | undefined> | undefined
): { formatted: unknown[][]; formulas: unknown[][]; hyperlinks: (string | null)[][] } {
  const formatted: unknown[][] = [];
  const formulas: unknown[][] = [];
  const hyperlinks: (string | null)[][] = [];
  for (const row of rowData ?? []) {
    const values = row?.values ?? [];
    const formattedRow: unknown[] = [];
    const formulaRow: unknown[] = [];
    const hrefRow: (string | null)[] = [];
    for (const cell of values) {
      formattedRow.push(cell?.formattedValue ?? "");
      formulaRow.push(cell?.userEnteredValue?.formulaValue ?? "");
      hrefRow.push(hrefFromGridCell(cell));
    }
    formatted.push(formattedRow);
    formulas.push(formulaRow);
    hyperlinks.push(hrefRow);
  }
  return { formatted, formulas, hyperlinks };
}

function resolveHref(
  value: unknown,
  text: string,
  formula: unknown,
  gridHref: string | null | undefined
): string | null {
  const explicit = providedHref(value);
  if (explicit) return hrefFromCandidate(explicit);
  // A HYPERLINK formula is the authoritative target when present; grid metadata
  // can expose a stale or different cell-level URL for the same displayed text.
  return hrefFromFormula(formula) ?? hrefFromCandidate(gridHref) ?? extractLinksHref(text);
}

export function parseLinksSheet(
  matrix: unknown[][],
  formulas: unknown[][] = [],
  hyperlinks: Array<Array<string | null | undefined>> = []
): LinksSheetData {
  const cells: LinksCell[] = [];
  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex] ?? [];
    const formulaRow = formulas[rowIndex] ?? [];
    const hrefRow = hyperlinks[rowIndex] ?? [];
    for (let column = 0; column < row.length; column += 1) {
      const value = row[column];
      const text = displayText(value);
      if (!text) continue;
      cells.push({
        row: rowIndex + 1,
        column,
        text,
        href: resolveHref(value, text, formulaRow[column], hrefRow[column] ?? null),
      });
    }
  }
  return { cells };
}

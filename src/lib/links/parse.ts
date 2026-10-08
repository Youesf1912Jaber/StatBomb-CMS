import type { LinksCell, LinksSheetData } from "./types";

export const LINKS_PARSER_CONTRACT = {
  input: "Sheets values API matrices: FORMATTED_VALUE required, FORMULA optional",
  cells: "one output cell per non-empty value, in sheet row/column order",
  text: "formatted cell display text, including Arabic, with invisible characters stripped",
  href: "http(s) only, from structured href, URL in text, or HYPERLINK() formula",
  columns: "none; Links is a freeform grid and is not parsed as a headered table",
} as const;

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

function resolveHref(value: unknown, text: string, formula: unknown): string | null {
  const explicit = providedHref(value);
  if (explicit) return normalizeHref(explicit) ?? extractLinksHref(explicit);
  return extractLinksHref(text) ?? hrefFromFormula(formula);
}

export function parseLinksSheet(matrix: unknown[][], formulas: unknown[][] = []): LinksSheetData {
  const cells: LinksCell[] = [];
  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex] ?? [];
    const formulaRow = formulas[rowIndex] ?? [];
    for (let column = 0; column < row.length; column += 1) {
      const value = row[column];
      const text = displayText(value);
      if (!text) continue;
      cells.push({
        row: rowIndex + 1,
        column,
        text,
        href: resolveHref(value, text, formulaRow[column]),
      });
    }
  }
  return { cells };
}

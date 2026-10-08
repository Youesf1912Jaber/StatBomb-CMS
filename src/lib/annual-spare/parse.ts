export type AnnualSpareRow = {
  hr_code: string;
  name: string | null;
  title: string | null;
  type: string | null;
  total_available: number | null;
  available_al_r: number | null;
  available_al_c: number | null;
  last_update: string | null;
  source_row_number: number;
};

function cellText(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u200b-\u200f\u202a-\u202e]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHeader(value: unknown): string {
  return cellText(value)
    .toLowerCase()
    .replace(/[_./]+/g, " ")
    .replace(/[-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function normalizeAnnualSpareHrCode(value: unknown): string {
  return cellText(value).toUpperCase();
}

export function parseAnnualSpareNumber(value: unknown): number | null {
  const text = cellText(value).replace(/%$/, "").trim();
  if (!text) return null;

  let candidate = text;
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(candidate)) {
    candidate = candidate.replace(/,/g, "");
  } else if (/^-?\d+,\d+$/.test(candidate)) {
    candidate = candidate.replace(",", ".");
  }

  const parsed = Number(candidate);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableText(value: unknown): string | null {
  const text = cellText(value);
  return text || null;
}

function findHeaderIndex(headers: string[], ...aliases: string[]): number {
  for (let i = 0; i < headers.length; i += 1) {
    const header = headers[i];
    if (header && aliases.includes(header)) return i;
  }
  return -1;
}

export type AnnualSpareColumnMap = {
  code: number;
  name: number;
  title: number;
  type: number;
  totalAvailable: number;
  availableAlR: number;
  availableAlC: number;
  lastUpdate: number;
};

export type AnnualSpareSheetInspection = {
  headerRowNumber: number;
  columns: AnnualSpareColumnMap;
  rows: AnnualSpareRow[];
};

export function detectAnnualSpareColumns(row: unknown[]): AnnualSpareColumnMap | null {
  const headers = row.map((cell) => normalizeHeader(cell));
  const code = findHeaderIndex(headers, "code", "hr code", "hrcode");
  if (code < 0) return null;
  return {
    code,
    name: findHeaderIndex(headers, "name", "collector", "collector name", "full name"),
    title: findHeaderIndex(headers, "title"),
    type: findHeaderIndex(headers, "type"),
    totalAvailable: findHeaderIndex(headers, "total available", "total available al"),
    availableAlR: findHeaderIndex(
      headers,
      "available al r",
      "available al  r",
      "available alr"
    ),
    availableAlC: findHeaderIndex(
      headers,
      "available al c",
      "available al  c",
      "available alc"
    ),
    lastUpdate: findHeaderIndex(headers, "last update", "last updated"),
  };
}

function cellAt(row: unknown[] | undefined, index: number): unknown {
  if (!row || index < 0) return "";
  return row[index];
}

function rowHasContent(row: unknown[] | undefined): boolean {
  if (!row) return false;
  return row.some((value) => cellText(value) !== "");
}

export function inspectAnnualSpareSheet(matrix: unknown[][]): AnnualSpareSheetInspection | null {
  let headerIndex = -1;
  let columns: AnnualSpareColumnMap | null = null;

  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
    const detected = detectAnnualSpareColumns(matrix[rowIndex] ?? []);
    if (detected) {
      headerIndex = rowIndex;
      columns = detected;
      break;
    }
  }

  if (!columns || headerIndex < 0) return null;

  const rows: AnnualSpareRow[] = [];
  for (let rowIndex = headerIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex] ?? [];
    if (!rowHasContent(row)) continue;
    if (detectAnnualSpareColumns(row)) continue;

    const hrCode = normalizeAnnualSpareHrCode(cellAt(row, columns.code));
    if (!hrCode) continue;

    rows.push({
      hr_code: hrCode,
      name: columns.name >= 0 ? nullableText(cellAt(row, columns.name)) : null,
      title: columns.title >= 0 ? nullableText(cellAt(row, columns.title)) : null,
      type: columns.type >= 0 ? nullableText(cellAt(row, columns.type)) : null,
      total_available: columns.totalAvailable >= 0 ? parseAnnualSpareNumber(cellAt(row, columns.totalAvailable)) : null,
      available_al_r: columns.availableAlR >= 0 ? parseAnnualSpareNumber(cellAt(row, columns.availableAlR)) : null,
      available_al_c: columns.availableAlC >= 0 ? parseAnnualSpareNumber(cellAt(row, columns.availableAlC)) : null,
      last_update: columns.lastUpdate >= 0 ? nullableText(cellAt(row, columns.lastUpdate)) : null,
      source_row_number: rowIndex + 1,
    });
  }

  return { headerRowNumber: headerIndex + 1, columns, rows };
}

export function parseAnnualSpareSheet(matrix: unknown[][]): AnnualSpareRow[] {
  return inspectAnnualSpareSheet(matrix)?.rows ?? [];
}

import "server-only";

import { googleRequest } from "@/lib/sync/google-sheets";
import { PreviewInputError } from "@/lib/sync/preview";
import {
  canonicalizeOverTargetHrCode,
  canonicalizeOverTargetMatchId,
  canonicalizeOverTargetText,
  parseOverTargetWeekDate,
  type OverTargetSheetSourceRow,
} from "./identity";

const GOOGLE_SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const OVER_TARGET_RANGE = "A:AZ";

export const OVER_TARGET_SHEET_GID = 1650824123;
export const OVER_TARGET_SHEET_TAB = "Over Target";

type SpreadsheetSheet = {
  properties?: {
    sheetId?: number;
    title?: string;
  };
};

export type OverTargetSheetWriteFields = {
  match_id: string;
  week: string;
  hr_code: string;
  team: string;
  collector: string;
  count: number;
};

export type OverTargetSheetWriteResult = {
  sheet_row_number: number;
  sheet_tab: string;
  sheet_gid: number;
};

type OverTargetColumnIndexes = {
  id: number;
  week: number;
  hrCode: number;
  team: number;
  collector: number;
  count: number;
  done: number;
};

type LoadedOverTargetSheet = {
  spreadsheetId: string;
  title: string;
  sheetId: number;
  matrix: unknown[][];
  indexes: OverTargetColumnIndexes;
};

function requiredSpreadsheetId(): string {
  const value = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();

  if (!value) {
    throw new PreviewInputError(
      "Google Sheets integration is not configured."
    );
  }

  return value;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function cellText(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function columnLetter(index: number): string {
  let n = index + 1;
  let label = "";

  while (n > 0) {
    const remainder = (n - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    n = Math.floor((n - 1) / 26);
  }

  return label;
}

function findColumnIndex(headers: string[], ...aliases: string[]): number {
  for (let i = 0; i < headers.length; i += 1) {
    const header = headers[i];

    if (header && aliases.includes(header)) {
      return i;
    }
  }

  return -1;
}

function resolveIndexes(headers: string[]): OverTargetColumnIndexes {
  const indexes: OverTargetColumnIndexes = {
    id: findColumnIndex(headers, "id", "match id", "matchid"),
    week: findColumnIndex(headers, "week", "week date", "date"),
    hrCode: findColumnIndex(
      headers,
      "hr code",
      "hrcode",
      "hr-code",
      "code",
      "collector code",
      "collector hr code"
    ),
    team: findColumnIndex(headers, "team", "team name"),
    collector: findColumnIndex(
      headers,
      "collector",
      "collector name",
      "name"
    ),
    count: findColumnIndex(headers, "count"),
    done: findColumnIndex(headers, "done"),
  };

  if (
    indexes.id < 0 ||
    indexes.week < 0 ||
    indexes.hrCode < 0 ||
    indexes.count < 0
  ) {
    throw new PreviewInputError(
      "The Over Target sheet is missing required ID, Week, Hr-Code, or Count headers."
    );
  }

  return indexes;
}

async function resolveOverTargetSheet(
  spreadsheetId: string
): Promise<{ title: string; sheetId: number }> {
  const configuredTitle =
    (
      process.env.GOOGLE_SHEETS_OVER_TARGET_TAB ?? OVER_TARGET_SHEET_TAB
    ).trim() || OVER_TARGET_SHEET_TAB;

  const configuredGid = Number(
    process.env.GOOGLE_SHEETS_OVER_TARGET_GID ??
      String(OVER_TARGET_SHEET_GID)
  );

  if (!Number.isSafeInteger(configuredGid) || configuredGid < 0) {
    throw new PreviewInputError(
      "Google Sheets tab configuration is invalid."
    );
  }

  const url = new URL(
    `${GOOGLE_SHEETS_API}/${encodeURIComponent(spreadsheetId)}`
  );

  url.searchParams.set(
    "fields",
    "sheets(properties(sheetId,title))"
  );

  const payload = await googleRequest<{
    sheets?: SpreadsheetSheet[];
  }>(url.toString());

  const sheet = (payload.sheets ?? []).find(
    (item) => item.properties?.sheetId === configuredGid
  );

  const title = sheet?.properties?.title;

  if (!title || sheet?.properties?.sheetId === undefined) {
    throw new PreviewInputError(
      "The configured Over Target sheet tab was not found."
    );
  }

  if (
    configuredTitle.toLowerCase() !==
    title.trim().toLowerCase()
  ) {
    throw new PreviewInputError(
      "The configured Over Target sheet tab does not match its GID."
    );
  }

  return {
    title,
    sheetId: sheet.properties.sheetId,
  };
}

async function loadOverTargetSheet(): Promise<LoadedOverTargetSheet> {
  const spreadsheetId = requiredSpreadsheetId();
  const sheet = await resolveOverTargetSheet(spreadsheetId);

  const payload = await googleRequest<{
    values?: unknown[][];
  }>(
    `${GOOGLE_SHEETS_API}/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(
      `${sheet.title}!${OVER_TARGET_RANGE}`
    )}?valueRenderOption=FORMATTED_VALUE`
  );

  const matrix = payload.values ?? [];

  if (matrix.length === 0) {
    throw new PreviewInputError("The Over Target sheet is empty.");
  }

  const headers = (matrix[0] ?? []).map(normalizeHeader);

  return {
    spreadsheetId,
    title: sheet.title,
    sheetId: sheet.sheetId,
    matrix,
    indexes: resolveIndexes(headers),
  };
}

/**
 * Determines whether a row contains an actual Over Target record.
 *
 * IMPORTANT:
 * The Done column is intentionally NOT considered here.
 *
 * The sheet contains FALSE values in Done for empty/template rows.
 * Those rows must still be treated as available for a new Over Target record.
 *
 * Example:
 * ID | Week | ETA | SLA | Hr-Code | Team | Collector | Count | Done
 *    |      |     |     |         |      |           |       | FALSE
 *
 * This row is considered empty because the actual OT data fields are empty.
 */
function rowHasContent(
  row: unknown[],
  indexes: OverTargetColumnIndexes
): boolean {
  const dataColumns = [
    indexes.id,
    indexes.week,
    indexes.hrCode,
    indexes.team,
    indexes.collector,
    indexes.count,
  ];

  return dataColumns.some(
    (index) => index >= 0 && cellText(row[index]) !== ""
  );
}

function mapSourceRow(
  row: unknown[],
  rowNumber: number,
  indexes: OverTargetColumnIndexes
): OverTargetSheetSourceRow | null {
  if (!rowHasContent(row, indexes)) {
    return null;
  }

  const cell = (column: number): string =>
    column >= 0 ? cellText(row[column]) : "";

  return {
    source_row_number: rowNumber,
    match_id: cell(indexes.id),
    week: cell(indexes.week),
    hr_code: cell(indexes.hrCode),
    team: cell(indexes.team),
    collector: cell(indexes.collector),
    count: cell(indexes.count),
    done: cell(indexes.done),
  };
}

export async function readOverTargetSheet(): Promise<
  OverTargetSheetSourceRow[]
> {
  const { matrix, indexes } = await loadOverTargetSheet();

  return matrix
    .slice(1)
    .map((row, index) =>
      mapSourceRow(row, index + 2, indexes)
    )
    .filter(
      (row): row is OverTargetSheetSourceRow =>
        row !== null
    );
}

/**
 * Finds the first available row for a new Over Target record.
 *
 * Done is deliberately ignored by rowHasContent(), so rows containing
 * template/formula FALSE values in Done are still considered empty.
 */
function findFirstEmptyRow(
  matrix: unknown[][],
  indexes: OverTargetColumnIndexes
): number {
  let lastContentRow = 1;

  for (let index = 1; index < matrix.length; index += 1) {
    const row = matrix[index] ?? [];

    if (rowHasContent(row, indexes)) {
      lastContentRow = index + 1;
    }
  }

  return lastContentRow + 1;
}

function cellWrite(
  title: string,
  row: number,
  column: number,
  value: string
) {
  return {
    range: `${title}!${columnLetter(column)}${row}`,
    majorDimension: "ROWS" as const,
    values: [[value]],
  };
}

function weekDatesMatch(
  left: string,
  right: string
): boolean {
  const parsedLeft = parseOverTargetWeekDate(left).iso;
  const parsedRight = parseOverTargetWeekDate(right).iso;

  if (parsedLeft && parsedRight) {
    return parsedLeft === parsedRight;
  }

  return (
    canonicalizeOverTargetText(left) ===
    canonicalizeOverTargetText(right)
  );
}

export async function appendOverTargetRow(
  fields: OverTargetSheetWriteFields
): Promise<OverTargetSheetWriteResult> {
  const {
    spreadsheetId,
    title,
    sheetId,
    matrix,
    indexes,
  } = await loadOverTargetSheet();

  const targetRow = findFirstEmptyRow(matrix, indexes);

  const writes = [
    cellWrite(
      title,
      targetRow,
      indexes.id,
      fields.match_id
    ),
    cellWrite(
      title,
      targetRow,
      indexes.week,
      fields.week
    ),
    cellWrite(
      title,
      targetRow,
      indexes.hrCode,
      fields.hr_code
    ),
    cellWrite(
      title,
      targetRow,
      indexes.count,
      String(fields.count)
    ),
  ];

  if (indexes.team >= 0) {
    writes.push(
      cellWrite(
        title,
        targetRow,
        indexes.team,
        fields.team
      )
    );
  }

  if (indexes.collector >= 0) {
    writes.push(
      cellWrite(
        title,
        targetRow,
        indexes.collector,
        fields.collector
      )
    );
  }

  await googleRequest(
    `${GOOGLE_SHEETS_API}/${encodeURIComponent(
      spreadsheetId
    )}/values:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data: writes,
      }),
    }
  );

  const verification = await googleRequest<{
    values?: unknown[][];
  }>(
    `${GOOGLE_SHEETS_API}/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(
      `${title}!A${targetRow}:AZ${targetRow}`
    )}?valueRenderOption=FORMATTED_VALUE`
  );

  const written = verification.values?.[0] ?? [];

  const writtenId = canonicalizeOverTargetMatchId(
    indexes.id >= 0
      ? cellText(written[indexes.id])
      : ""
  );

  const writtenWeek =
    indexes.week >= 0
      ? cellText(written[indexes.week])
      : "";

  const writtenHr = canonicalizeOverTargetHrCode(
    indexes.hrCode >= 0
      ? cellText(written[indexes.hrCode])
      : ""
  );

  const writtenCount =
    indexes.count >= 0
      ? cellText(written[indexes.count])
      : "";

  if (
    writtenId !==
      canonicalizeOverTargetMatchId(fields.match_id) ||
    !weekDatesMatch(writtenWeek, fields.week) ||
    writtenHr !==
      canonicalizeOverTargetHrCode(fields.hr_code) ||
    writtenCount !== String(fields.count)
  ) {
    throw new PreviewInputError(
      "The Over Target row could not be verified."
    );
  }

  return {
    sheet_row_number: targetRow,
    sheet_tab: title,
    sheet_gid: sheetId,
  };
}

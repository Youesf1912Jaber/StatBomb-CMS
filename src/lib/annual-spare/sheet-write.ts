import "server-only";

import { googleRequest } from "@/lib/sync/google-sheets";
import {
  inspectAnnualSpareSheet,
  parseAnnualSpareSheet,
} from "./parse";
import { readAnnualSpareSheetSnapshot } from "./sheet";
import {
  formatAnnualSpareLastUpdate,
  isNoOpAnnualSpareDelta,
  planAnnualSpareWriteFromInspection,
  verifyAnnualSpareWrite,
  type AnnualSpareBalanceDelta,
  type AnnualSpareWritePlan,
  type AnnualSpareWriteTarget,
} from "./write-plan";

const GOOGLE_SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

function columnLetter(index: number): string {
  if (index < 0) return "";
  let n = index + 1;
  let label = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

export type AnnualSpareSheetWriteResult =
  | { ok: true; target: AnnualSpareWriteTarget; lastUpdate: string | null }
  | { ok: false; message: string };

function cellWrite(title: string, row: number, column: number, value: string) {
  return {
    range: `${title}!${columnLetter(column)}${row}`,
    majorDimension: "ROWS" as const,
    values: [[value]],
  };
}

function formatBalanceValue(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

export function annualSpareWritePlanFromMatrix(
  matrix: unknown[][],
  hrCode: string,
  delta: AnnualSpareBalanceDelta
): AnnualSpareWritePlan {
  const inspection = inspectAnnualSpareSheet(matrix);
  if (!inspection) {
    return { ok: false, reason: "missing_columns", message: "Annual Spare headers could not be detected." };
  }
  return planAnnualSpareWriteFromInspection(inspection, hrCode, delta);
}

export async function writeAnnualSpareBalanceDelta(input: {
  hrCode: string;
  delta: AnnualSpareBalanceDelta;
  now?: Date;
}): Promise<AnnualSpareSheetWriteResult> {
  if (isNoOpAnnualSpareDelta(input.delta)) {
    return {
      ok: true,
      target: {
        rowNumber: 0,
        hrCode: input.hrCode,
        currentTotal: 0,
        currentAlR: 0,
        currentAlC: 0,
        nextTotal: 0,
        nextAlR: 0,
        nextAlC: 0,
      },
      lastUpdate: null,
    };
  }

  const snapshot = await readAnnualSpareSheetSnapshot();
  const inspection = inspectAnnualSpareSheet(snapshot.matrix);
  if (!inspection) {
    return { ok: false, message: "Annual Spare headers could not be detected." };
  }

  const plan = planAnnualSpareWriteFromInspection(inspection, input.hrCode, input.delta);
  if (!plan.ok) {
    return { ok: false, message: plan.message };
  }

  const lastUpdate =
    plan.columns.lastUpdate >= 0 ? formatAnnualSpareLastUpdate(input.now ?? new Date()) : null;
  const data = [
    cellWrite(snapshot.title, plan.target.rowNumber, plan.columns.totalAvailable, formatBalanceValue(plan.target.nextTotal)),
    cellWrite(snapshot.title, plan.target.rowNumber, plan.columns.availableAlR, formatBalanceValue(plan.target.nextAlR)),
    cellWrite(snapshot.title, plan.target.rowNumber, plan.columns.availableAlC, formatBalanceValue(plan.target.nextAlC)),
  ];
  if (lastUpdate !== null && plan.columns.lastUpdate >= 0) {
    data.push(cellWrite(snapshot.title, plan.target.rowNumber, plan.columns.lastUpdate, lastUpdate));
  }

  await googleRequest(`${GOOGLE_SHEETS_API}/${encodeURIComponent(snapshot.spreadsheetId)}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
  });

  const after = await readAnnualSpareSheetSnapshot();
  const afterRows = parseAnnualSpareSheet(after.matrix);
  const verifiedRow = afterRows.find(
    (row) => row.source_row_number === plan.target.rowNumber
  );
  const verification = verifyAnnualSpareWrite({
    row: verifiedRow,
    expectedHrCode: plan.target.hrCode,
    expectedTotal: plan.target.nextTotal,
    expectedAlR: plan.target.nextAlR,
    expectedAlC: plan.target.nextAlC,
  });
  if (!verification.ok) {
    return { ok: false, message: verification.message };
  }

  return { ok: true, target: plan.target, lastUpdate };
}

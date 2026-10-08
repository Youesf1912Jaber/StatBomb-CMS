import type { AnnualLeaveAction, AnnualLeaveLedgerRow, AnnualLeaveType } from "../../types/database.types";
import {
  inspectAnnualSpareSheet,
  normalizeAnnualSpareHrCode,
  parseAnnualSpareNumber,
  type AnnualSpareColumnMap,
  type AnnualSpareRow,
  type AnnualSpareSheetInspection,
} from "./parse";

export type AnnualSpareBalanceDelta = {
  total: number;
  alR: number;
  alC: number;
};

export type AnnualSpareWriteTarget = {
  rowNumber: number;
  hrCode: string;
  currentTotal: number;
  currentAlR: number;
  currentAlC: number;
  nextTotal: number;
  nextAlR: number;
  nextAlC: number;
};

export type AnnualSpareWriteFailureReason =
  | "missing_hr_code"
  | "duplicate_hr_code"
  | "invalid_balance"
  | "negative_balance"
  | "missing_columns";

export type AnnualSpareWritePlan =
  | { ok: true; target: AnnualSpareWriteTarget; columns: AnnualSpareColumnMap }
  | { ok: false; reason: AnnualSpareWriteFailureReason; message: string };

// Last update is written as UTC dd/MM/yyyy to match existing Annual Spare sheet values such as 01/10/2026.
const ANNUAL_SPARE_LAST_UPDATE_FORMAT = "dd/MM/yyyy";

export function annualLeaveSheetDelta(
  leaveType: AnnualLeaveType,
  action: AnnualLeaveAction
): AnnualSpareBalanceDelta {
  if (leaveType === "AL-R" && action === "consume") return { total: -1, alR: -1, alC: 0 };
  if (leaveType === "AL-R" && action === "reverse") return { total: 1, alR: 1, alC: 0 };
  if (leaveType === "AL-C" && action === "consume") return { total: -1, alR: 0, alC: -1 };
  return { total: 1, alR: 0, alC: 1 };
}

export function combineAnnualSpareDeltas(deltas: AnnualSpareBalanceDelta[]): AnnualSpareBalanceDelta {
  return deltas.reduce(
    (acc, delta) => ({
      total: acc.total + delta.total,
      alR: acc.alR + delta.alR,
      alC: acc.alC + delta.alC,
    }),
    { total: 0, alR: 0, alC: 0 }
  );
}

export function typeSwitchAnnualSpareDelta(
  from: AnnualLeaveType,
  to: AnnualLeaveType
): AnnualSpareBalanceDelta {
  if (from === to) return { total: 0, alR: 0, alC: 0 };
  if (from === "AL-R" && to === "AL-C") return { total: 0, alR: 1, alC: -1 };
  return { total: 0, alR: -1, alC: 1 };
}

export function isNoOpAnnualSpareDelta(delta: AnnualSpareBalanceDelta): boolean {
  return delta.total === 0 && delta.alR === 0 && delta.alC === 0;
}

function requireNumber(value: number | null, label: string): number {
  if (value === null || !Number.isFinite(value)) {
    throw Object.assign(new Error(`${label} is null or unparseable.`), { reason: "invalid_balance" as const });
  }
  return value;
}

export function findAnnualSpareRowsForHrCode(
  rows: AnnualSpareRow[],
  hrCode: string
): AnnualSpareRow[] {
  const canonical = normalizeAnnualSpareHrCode(hrCode);
  if (!canonical) return [];
  return rows.filter((row) => row.hr_code === canonical);
}

export function planAnnualSpareWrite(input: {
  matrix: unknown[][];
  hrCode: string;
  delta: AnnualSpareBalanceDelta;
}): AnnualSpareWritePlan {
  const inspection = inspectAnnualSpareSheet(input.matrix);
  if (!inspection) {
    return { ok: false, reason: "missing_columns", message: "Annual Spare headers could not be detected." };
  }
  return planAnnualSpareWriteFromInspection(inspection, input.hrCode, input.delta);
}

export function planAnnualSpareWriteFromInspection(
  inspection: AnnualSpareSheetInspection,
  hrCode: string,
  delta: AnnualSpareBalanceDelta
): AnnualSpareWritePlan {
  const { columns, rows } = inspection;
  if (columns.totalAvailable < 0 || columns.availableAlR < 0 || columns.availableAlC < 0) {
    return {
      ok: false,
      reason: "missing_columns",
      message: "Annual Spare is missing Total available, Available AL - R, or Available AL - C.",
    };
  }

  const canonical = normalizeAnnualSpareHrCode(hrCode);
  if (!canonical) {
    return { ok: false, reason: "missing_hr_code", message: "HR-Code is required." };
  }

  const matches = findAnnualSpareRowsForHrCode(rows, canonical);
  if (matches.length === 0) {
    return { ok: false, reason: "missing_hr_code", message: `No Annual Spare row matched HR-Code ${canonical}.` };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      reason: "duplicate_hr_code",
      message: `More than one Annual Spare row matched HR-Code ${canonical}.`,
    };
  }

  const row = matches[0];
  if (!row) {
    return { ok: false, reason: "missing_hr_code", message: `No Annual Spare row matched HR-Code ${canonical}.` };
  }

  try {
    const currentTotal = requireNumber(row.total_available, "Total available");
    const currentAlR = requireNumber(row.available_al_r, "Available AL - R");
    const currentAlC = requireNumber(row.available_al_c, "Available AL - C");
    const nextTotal = currentTotal + delta.total;
    const nextAlR = currentAlR + delta.alR;
    const nextAlC = currentAlC + delta.alC;
    if (nextTotal < 0 || nextAlR < 0 || nextAlC < 0) {
      return {
        ok: false,
        reason: "negative_balance",
        message: `Annual Spare write for ${canonical} would produce a negative balance.`,
      };
    }
    return {
      ok: true,
      columns,
      target: {
        rowNumber: row.source_row_number,
        hrCode: canonical,
        currentTotal,
        currentAlR,
        currentAlC,
        nextTotal,
        nextAlR,
        nextAlC,
      },
    };
  } catch (error) {
    const reason =
      error && typeof error === "object" && "reason" in error && error.reason === "invalid_balance"
        ? "invalid_balance"
        : "invalid_balance";
    return {
      ok: false,
      reason,
      message: error instanceof Error ? error.message : "Annual Spare balance is null or unparseable.",
    };
  }
}

export function formatAnnualSpareLastUpdate(date: Date = new Date()): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = String(date.getUTCFullYear());
  return `${day}/${month}/${year}`;
}

export function annualSpareLastUpdateFormat(): string {
  return ANNUAL_SPARE_LAST_UPDATE_FORMAT;
}

export function verifyAnnualSpareWrite(input: {
  row: AnnualSpareRow | undefined;
  expectedHrCode: string;
  expectedTotal: number;
  expectedAlR: number;
  expectedAlC: number;
}): { ok: true } | { ok: false; message: string } {
  const row = input.row;
  if (!row) {
    return { ok: false, message: "Annual Spare verification row was not found." };
  }
  const hrCode = normalizeAnnualSpareHrCode(row.hr_code);
  if (hrCode !== normalizeAnnualSpareHrCode(input.expectedHrCode)) {
    return { ok: false, message: "Annual Spare HR-Code changed during write verification." };
  }
  if (row.total_available !== input.expectedTotal) {
    return { ok: false, message: "Annual Spare Total available did not match the expected result." };
  }
  if (row.available_al_r !== input.expectedAlR) {
    return { ok: false, message: "Annual Spare Available AL - R did not match the expected result." };
  }
  if (row.available_al_c !== input.expectedAlC) {
    return { ok: false, message: "Annual Spare Available AL - C did not match the expected result." };
  }
  return { ok: true };
}

export function parseAnnualSpareBalanceCell(value: unknown): number | null {
  return parseAnnualSpareNumber(value);
}

export function pendingLedgerDelta(row: Pick<AnnualLeaveLedgerRow, "leave_type" | "action">): AnnualSpareBalanceDelta {
  return annualLeaveSheetDelta(row.leave_type, row.action);
}

export type PendingLedgerSheetRow = Pick<
  AnnualLeaveLedgerRow,
  "id" | "hr_code" | "leave_type" | "action" | "sheet_sync_status"
>;

export type PendingHrCodeGroup = {
  hrCode: string;
  rows: PendingLedgerSheetRow[];
  delta: AnnualSpareBalanceDelta;
};

export function groupPendingAnnualLeaveSheetWrites(
  rows: PendingLedgerSheetRow[]
): PendingHrCodeGroup[] {
  const groups = new Map<string, PendingHrCodeGroup>();
  const order: string[] = [];

  for (const row of rows) {
    if (row.sheet_sync_status !== "pending") continue;
    const hrCode = normalizeAnnualSpareHrCode(row.hr_code);
    let group = groups.get(hrCode);
    if (!group) {
      group = { hrCode, rows: [], delta: { total: 0, alR: 0, alC: 0 } };
      groups.set(hrCode, group);
      order.push(hrCode);
    }
    group.rows.push(row);
    group.delta = combineAnnualSpareDeltas([group.delta, pendingLedgerDelta(row)]);
  }

  return order.map((hrCode) => {
    const group = groups.get(hrCode);
    if (!group) {
      return { hrCode, rows: [], delta: { total: 0, alR: 0, alC: 0 } };
    }
    return group;
  });
}

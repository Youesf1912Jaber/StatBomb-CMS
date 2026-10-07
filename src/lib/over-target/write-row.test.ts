import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findFirstEmptyOverTargetRow,
  overTargetRowHasData,
  type OverTargetWriteColumnIndexes,
} from "./write-row";

const INDEXES: OverTargetWriteColumnIndexes = {
  id: 0,
  week: 1,
  hrCode: 4,
  team: 5,
  collector: 6,
  count: 7,
};

function headerRow(): unknown[] {
  return [
    "ID",
    "Week",
    "ETA",
    "SLA",
    "Hr-Code",
    "Team",
    "Collector",
    "Count",
    "Done",
  ];
}

function occupiedRow(id: number): unknown[] {
  return [
    String(id),
    "10/5/2026",
    "10/6/2026 12:00",
    "10/6/2026 18:00",
    "A-100",
    "Team A",
    "Jane",
    "2",
    "TRUE",
  ];
}

function templateEmptyRow(): unknown[] {
  return [
    "",
    "",
    "=A302+1",
    "#REF!",
    "",
    "",
    "",
    "",
    "FALSE",
  ];
}

function buildSheet(lastOccupiedRow: number, trailingEmptyRows: number): unknown[][] {
  const matrix: unknown[][] = [headerRow()];

  for (let row = 2; row <= lastOccupiedRow; row += 1) {
    matrix.push(occupiedRow(row));
  }

  for (let i = 0; i < trailingEmptyRows; i += 1) {
    matrix.push(templateEmptyRow());
  }

  return matrix;
}

describe("findFirstEmptyOverTargetRow", () => {
  it("selects row 303 when 302 has real OT data and 303+ have empty OT fields with ETA/SLA/Done", () => {
    const matrix = buildSheet(302, 680);
    matrix.push(occupiedRow(983), occupiedRow(984), occupiedRow(985));

    assert.equal(matrix.length, 985);
    assert.equal(overTargetRowHasData(matrix[301] ?? [], INDEXES), true);
    assert.equal(overTargetRowHasData(matrix[302] ?? [], INDEXES), false);
    assert.equal(overTargetRowHasData(matrix[303] ?? [], INDEXES), false);
    assert.equal((matrix[302] ?? [])[2], "=A302+1");
    assert.equal((matrix[302] ?? [])[3], "#REF!");
    assert.equal((matrix[302] ?? [])[8], "FALSE");
    assert.equal(overTargetRowHasData(matrix[982] ?? [], INDEXES), true);
    assert.notEqual(findFirstEmptyOverTargetRow(matrix, INDEXES), 986);
    assert.notEqual(findFirstEmptyOverTargetRow(matrix, INDEXES), 983);
    assert.notEqual(findFirstEmptyOverTargetRow(matrix, INDEXES), 985);
    assert.equal(findFirstEmptyOverTargetRow(matrix, INDEXES), 303);
  });

  it("skips an occupied row and selects the next empty OT row", () => {
    const matrix = buildSheet(302, 2);
    matrix[302] = occupiedRow(303);

    assert.equal(overTargetRowHasData(matrix[302] ?? [], INDEXES), true);
    assert.equal(overTargetRowHasData(matrix[303] ?? [], INDEXES), false);
    assert.equal(findFirstEmptyOverTargetRow(matrix, INDEXES), 304);
  });
});

export type OverTargetWriteColumnIndexes = {
  id: number;
  week: number;
  hrCode: number;
  team: number;
  collector: number;
  count: number;
};

function cellText(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function overTargetRowHasData(
  row: unknown[],
  indexes: OverTargetWriteColumnIndexes
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

export function findFirstEmptyOverTargetRow(
  matrix: unknown[][],
  indexes: OverTargetWriteColumnIndexes
): number {
  for (let index = 1; index < matrix.length; index += 1) {
    const row = matrix[index] ?? [];

    if (!overTargetRowHasData(row, indexes)) {
      return index + 1;
    }
  }

  return matrix.length + 1;
}

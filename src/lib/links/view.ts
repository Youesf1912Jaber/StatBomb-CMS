import type { LinksCell } from "./types";

export function isLinksHttpHref(href: string | null | undefined): href is string {
  if (!href) return false;
  try {
    const parsed = new URL(href);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function groupLinksCellsByRow(cells: LinksCell[]): LinksCell[][] {
  const rows = new Map<number, LinksCell[]>();
  for (const cell of cells) {
    const existing = rows.get(cell.row);
    if (existing) {
      existing.push(cell);
    } else {
      rows.set(cell.row, [cell]);
    }
  }
  return [...rows.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, rowCells]) => [...rowCells].sort((left, right) => left.column - right.column));
}

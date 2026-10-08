import type { LinksCell } from "@/lib/links/types";
import { groupLinksCellsByRow, isLinksHttpHref } from "@/lib/links/view";

interface LinksBoardProps {
  cells: LinksCell[];
}

function LinksItem({ cell }: { cell: LinksCell }) {
  const className =
    "block rounded-card border border-pitch-700 bg-pitch-800 px-4 py-3 text-center text-sm text-chalk-50";

  if (isLinksHttpHref(cell.href)) {
    return (
      <a href={cell.href} target="_blank" rel="noopener noreferrer" className={`${className} hover:border-clock-amber hover:text-clock-amber`}>
        {cell.text}
      </a>
    );
  }

  return <div className={className}>{cell.text}</div>;
}

export function LinksBoard({ cells }: LinksBoardProps) {
  const rows = groupLinksCellsByRow(cells);

  return (
    <div className="space-y-3">
      {rows.map((rowCells) => (
        <div key={rowCells[0]?.row} className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
          {rowCells.map((cell) => (
            <div key={`${cell.row}-${cell.column}`} className="min-w-0 flex-1">
              <LinksItem cell={cell} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

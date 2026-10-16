import type { LinksCell } from "@/lib/links/types";
import { groupLinksCellsByRow, isLinksHttpHref } from "@/lib/links/view";

interface LinksBoardProps {
  cells: LinksCell[];
  search?: string;
}

function LinksItem({ cell }: { cell: LinksCell }) {
  const isLink = isLinksHttpHref(cell.href);
  const className =
    "group flex h-full min-w-0 items-start gap-3 rounded-xl border border-pitch-700 bg-pitch-900/70 p-3.5 text-left transition duration-150 sm:p-4";

  let displayText = cell.text;
  if (isLink) {
    try {
      const url = new URL(cell.href ?? "");
      displayText = url.hostname.replace(/^www\./, "") + (url.pathname === "/" ? "" : url.pathname);
    } catch {
      displayText = cell.text;
    }
  }

  const content = (
    <>
      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${isLink ? "border-clock-amber/30 bg-clock-amber/10 text-clock-amber" : "border-pitch-600 bg-pitch-800 text-chalk-200"}`}>
        <span aria-hidden="true" className="text-sm">{isLink ? "↗" : "▤"}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm font-semibold leading-5 text-chalk-50 group-hover:text-clock-amber">{cell.text}</span>
        {isLink && (
          <span title={cell.href ?? undefined} className="mt-1 block break-all text-xs leading-5 text-chalk-200/80">
            {displayText}
          </span>
        )}
      </span>
      {isLink && <span aria-hidden="true" className="mt-1 shrink-0 text-xs text-chalk-200 transition group-hover:translate-x-0.5 group-hover:text-clock-amber">↗</span>}
    </>
  );

  if (isLink) {
    return (
      <a href={cell.href!} target="_blank" rel="noopener noreferrer" title={cell.text} className={`${className} hover:border-clock-amber/70 hover:bg-pitch-800/90`}>
        {content}
      </a>
    );
  }

  return <div className={className}>{content}</div>;
}

export function LinksBoard({ cells, search = "" }: LinksBoardProps) {
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const rows = groupLinksCellsByRow(cells).filter((rowCells) =>
    !normalizedSearch || rowCells.some((cell) =>
      cell.text.toLocaleLowerCase().includes(normalizedSearch) ||
      (cell.href ?? "").toLocaleLowerCase().includes(normalizedSearch)
    )
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-pitch-600 px-4 py-10 text-center">
        <p className="font-display text-lg text-chalk-50">No matching resources</p>
        <p className="mt-1 text-sm text-chalk-200">Try another title, keyword, or URL.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-chalk-200">
        <span>Resources</span>
        <span>{rows.length} {rows.length === 1 ? "row" : "rows"}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {rows.map((rowCells) => (
          <section key={rowCells[0]?.row} className="min-w-0 rounded-xl border border-pitch-700/80 bg-pitch-950/70 p-2.5 sm:p-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-chalk-200/70">Sheet row {rowCells[0]?.row}</span>
              <span className="h-px flex-1 ml-3 bg-pitch-700/70" />
            </div>
            <div className={`grid min-w-0 gap-2 ${rowCells.length > 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
              {rowCells.map((cell) => (
                <LinksItem key={`${cell.row}-${cell.column}`} cell={cell} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

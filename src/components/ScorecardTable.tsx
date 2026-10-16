import { displayScorecardCell } from "@/lib/scorecard/view";
import type { ScorecardRow } from "@/lib/scorecard/types";

interface ScorecardTableProps {
  headers: string[];
  rows: ScorecardRow[];
}

export function ScorecardTable({ headers, rows }: ScorecardTableProps) {
  return (
    <section className="w-full min-w-0 space-y-4" aria-label="Scorecard records">
      {rows.map((row, rowIndex) => {
        const identityFields = headers.slice(0, Math.min(3, headers.length));
        const detailFields = headers.slice(3);

        return (
          <article
            key={`${row.identity.month}-${row.identity.hr_code}-${rowIndex}`}
            className="w-full min-w-0 overflow-hidden rounded-xl border border-pitch-700 bg-pitch-900 shadow-sm"
          >
            <header className="border-b border-pitch-700 bg-pitch-800/80 px-4 py-4 sm:px-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {identityFields.map((header, index) => (
                  <div key={`${index}-${header}`} className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-chalk-300">{header}</p>
                    <p className="mt-1 break-words text-sm font-semibold text-chalk-50">
                      {displayScorecardCell(row.cells[index] ?? "") || "—"}
                    </p>
                  </div>
                ))}
              </div>
            </header>

            {detailFields.length > 0 && (
              <dl className="grid grid-cols-1 gap-px bg-pitch-700 sm:grid-cols-2 lg:grid-cols-3">
                {detailFields.map((header, detailIndex) => {
                  const cellIndex = detailIndex + 3;
                  const value = displayScorecardCell(row.cells[cellIndex] ?? "");
                  return (
                    <div key={`${cellIndex}-${header}`} className="min-w-0 bg-pitch-900 px-4 py-3 sm:px-5">
                      <dt className="break-words text-[11px] font-semibold uppercase tracking-[0.08em] text-chalk-300">
                        {header}
                      </dt>
                      <dd className="mt-1 break-words text-sm leading-5 text-chalk-50">
                        {value || "—"}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            )}
          </article>
        );
      })}
    </section>
  );
}

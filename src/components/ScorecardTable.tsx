import { displayScorecardCell } from "@/lib/scorecard/view";
import type { ScorecardRow } from "@/lib/scorecard/types";

interface ScorecardTableProps {
  headers: string[];
  rows: ScorecardRow[];
}

export function ScorecardTable({ headers, rows }: ScorecardTableProps) {
  return (
    <div
      className="w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded-card border border-pitch-700"
      role="region"
      aria-label="Scorecard table"
      tabIndex={0}
    >
      <table className="w-max min-w-full border-separate border-spacing-0 text-left text-sm">
        <thead className="bg-pitch-800 text-xs uppercase tracking-wide text-chalk-200">
          <tr>
            {headers.map((header, index) => (
              <th
                key={`${index}-${header}`}
                scope="col"
                className={`whitespace-nowrap border-b border-pitch-700 px-3 py-3 font-medium ${index === 0 ? "sticky left-0 z-20 min-w-[105px] bg-pitch-800" : ""} ${index === 1 ? "sticky left-[105px] z-20 min-w-[90px] bg-pitch-800" : ""} ${index === 2 ? "sticky left-[195px] z-20 min-w-[125px] bg-pitch-800 shadow-[3px_0_5px_-3px_rgba(0,0,0,0.8)]" : ""}`}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-pitch-800">
          {rows.map((row, rowIndex) => (
            <tr
              key={`${row.identity.month}-${row.identity.hr_code}-${rowIndex}`}
              className="bg-pitch-900 text-chalk-50"
            >
              {headers.map((header, columnIndex) => (
                <td
                  key={`${rowIndex}-${columnIndex}-${header}`}
                  className={`whitespace-nowrap border-b border-pitch-800 px-3 py-3 ${columnIndex === 0 ? "sticky left-0 z-10 min-w-[105px] bg-pitch-900" : ""} ${columnIndex === 1 ? "sticky left-[105px] z-10 min-w-[90px] bg-pitch-900" : ""} ${columnIndex === 2 ? "sticky left-[195px] z-10 min-w-[125px] bg-pitch-900 shadow-[3px_0_5px_-3px_rgba(0,0,0,0.8)]" : ""}`}
                >
                  {displayScorecardCell(row.cells[columnIndex] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

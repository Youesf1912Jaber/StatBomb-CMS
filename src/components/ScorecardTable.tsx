import { displayScorecardCell } from "@/lib/scorecard/view";
import type { ScorecardRow } from "@/lib/scorecard/types";

interface ScorecardTableProps {
  headers: string[];
  rows: ScorecardRow[];
}

export function ScorecardTable({ headers, rows }: ScorecardTableProps) {
  return (
    <div className="overflow-x-auto rounded-card border border-pitch-700">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-pitch-800 text-xs uppercase tracking-wide text-chalk-200">
          <tr>
            {headers.map((header, index) => (
              <th key={`${index}-${header}`} className="whitespace-nowrap px-3 py-3 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-pitch-800">
          {rows.map((row, rowIndex) => (
            <tr key={`${row.identity.month}-${row.identity.hr_code}-${rowIndex}`} className="bg-pitch-900 text-chalk-50">
              {headers.map((header, columnIndex) => (
                <td key={`${rowIndex}-${columnIndex}-${header}`} className="whitespace-nowrap px-3 py-3">
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

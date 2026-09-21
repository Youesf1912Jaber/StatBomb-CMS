"use client";

import { useState } from "react";
import { DistributionEditForm } from "./DistributionEditForm";
import type { DistributionMatchRow, TeamSheetCollector } from "@/lib/sync/google-sheets";

type DistributionRowsClientProps = {
  matchId: string;
  distribution: DistributionMatchRow[];
  collectors: TeamSheetCollector[];
};

export function DistributionRowsClient({ matchId, distribution, collectors }: DistributionRowsClientProps) {
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  return (
    <>
      {success && <p role="status" className="rounded-[8px] border border-green-900 bg-green-950/30 px-4 py-3 text-sm text-green-200">{success}</p>}
      <div className="overflow-x-auto rounded-card border border-pitch-700">
        <table className="min-w-[1200px] w-full text-left text-sm">
          <thead className="bg-pitch-900 text-xs uppercase tracking-wide text-pitch-500">
            <tr>
              {["Collector HR", "Collector", "Task", "Half", "Status", "SLA", "Shift Date", "Match Date", "Kick-Off", "Notes", "Review Events", "Action"].map((heading) => (
                <th key={heading} className="px-3 py-3 font-medium">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-pitch-800">
            {distribution.length === 0 ? (
              <tr><td colSpan={12} className="px-3 py-10 text-center text-sm text-chalk-200">No Distribution rows were found for this Match ID.</td></tr>
            ) : distribution.map((row) => (
              <tr key={`${row.match_id}-${row.collector_hr_code ?? "unknown"}-${row.task ?? "task"}-${row.half ?? "half"}-${row.raw_row_number}`} className="text-chalk-100 align-top">
                <td className="whitespace-nowrap px-3 py-3 font-mono text-xs">{row.collector_hr_code ?? "—"}</td>
                <td className="px-3 py-3">{row.collector_name ?? "—"}</td>
                <td className="px-3 py-3">{row.task ?? "—"}</td>
                <td className="px-3 py-3">{row.half ?? "—"}</td>
                <td className="px-3 py-3">{row.status ?? "—"}</td>
                <td className="px-3 py-3">{row.sla ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-3">{row.shift_date ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-3">{row.match_date ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-3">{row.kick_off_time ?? "—"}</td>
                <td className="px-3 py-3">{row.hyper_care_notes ?? "—"}</td>
                <td className="px-3 py-3">{row.review_events ?? "—"}</td>
                <td className="px-3 py-3">
                  {editingRow === row.raw_row_number ? (
                    <DistributionEditForm
                      matchId={matchId}
                      row={row}
                      collectors={collectors}
                      onCancel={() => setEditingRow(null)}
                      onSaved={() => {
                        setEditingRow(null);
                        setSuccess("Distribution assignment updated successfully.");
                      }}
                    />
                  ) : (
                    <button type="button" onClick={() => { setSuccess(null); setEditingRow(row.raw_row_number); }} className="rounded-[6px] border border-pitch-700 px-2.5 py-1.5 text-xs text-chalk-50 hover:border-clock-amber">Edit</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DISTRIBUTION_TASK_OPTIONS } from "@/lib/distribution-options";
import type { DistributionMatchRow, TeamSheetCollector } from "@/lib/sync/google-sheets";

type DistributionEditFormProps = {
  matchId: string;
  row: DistributionMatchRow;
  collectors: TeamSheetCollector[];
  onCancel: () => void;
  onSaved: () => void;
};

const HALF_OPTIONS = ["Half 1", "Half 2", "Half 3", "Half 4", "Full Match"];

export function DistributionEditForm({ matchId, row, collectors, onCancel, onSaved }: DistributionEditFormProps) {
  const router = useRouter();
  const [collectorHrCode, setCollectorHrCode] = useState(row.collector_hr_code ?? "");
  const [task, setTask] = useState(row.task ?? "");
  const [half, setHalf] = useState(row.half ?? "Full Match");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!window.confirm("This will update this assignment in the Distribution Google Sheet.")) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/matches/${encodeURIComponent(matchId)}/distribution/${row.raw_row_number}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedCollectorHrCode: row.collector_hr_code,
          expectedTask: row.task,
          expectedHalf: row.half,
          collectorHrCode,
          task,
          half,
        }),
      });
      const payload = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error ?? "The assignment could not be updated.");
      onSaved();
      router.refresh();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "The assignment could not be updated.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-[8px] border border-clock-amber/50 bg-pitch-950 p-3">
      {error && <p role="alert" className="text-xs text-red-200">{error}</p>}
      <label className="block text-xs text-chalk-200">
        Collector
        <select required value={collectorHrCode} onChange={(event) => setCollectorHrCode(event.target.value)} className="mt-1 block w-full rounded-[6px] border border-pitch-700 bg-pitch-900 px-2 py-1.5 text-xs text-chalk-50">
          <option value="">Select a collector</option>
          {collectors.map((collector) => <option key={collector.hr_code} value={collector.hr_code}>{collector.full_name} ({collector.hr_code})</option>)}
        </select>
      </label>
      <label className="block text-xs text-chalk-200">
        Task
        <select required value={task} onChange={(event) => setTask(event.target.value)} className="mt-1 block w-full rounded-[6px] border border-pitch-700 bg-pitch-900 px-2 py-1.5 text-xs text-chalk-50">
          <option value="">Select a task</option>
          {DISTRIBUTION_TASK_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <label className="block text-xs text-chalk-200">
        Half
        <select required value={half} onChange={(event) => setHalf(event.target.value)} className="mt-1 block w-full rounded-[6px] border border-pitch-700 bg-pitch-900 px-2 py-1.5 text-xs text-chalk-50">
          {HALF_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="rounded-[6px] bg-clock-amber px-2.5 py-1.5 text-xs font-medium text-pitch-950 disabled:opacity-50">{saving ? "Saving…" : "Save Changes"}</button>
        <button type="button" onClick={onCancel} disabled={saving} className="rounded-[6px] border border-pitch-700 px-2.5 py-1.5 text-xs text-chalk-50">Cancel</button>
      </div>
    </form>
  );
}

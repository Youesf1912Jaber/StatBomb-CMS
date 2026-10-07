import type { OverTargetRow, OverTargetSheetSyncStatus } from "@/types/database.types";

export function displayOverTargetText(value: string | null | undefined): string {
  return value && value.trim() ? value.trim() : "—";
}

export function displayOverTargetWeek(row: Pick<OverTargetRow, "week_date" | "week_date_raw">): string {
  if (row.week_date_raw && row.week_date_raw.trim()) return row.week_date_raw.trim();
  if (!row.week_date) return "—";
  const match = row.week_date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match || !match[1] || !match[2] || !match[3]) return row.week_date;
  return `${Number(match[2])}/${Number(match[3])}/${Number(match[1])}`;
}

export function displayOverTargetCount(row: Pick<OverTargetRow, "count_value" | "count_raw">): string {
  if (row.count_value != null) return String(row.count_value);
  return displayOverTargetText(row.count_raw);
}

export function displayOverTargetDone(row: Pick<OverTargetRow, "done" | "done_raw">): string {
  if (row.done === true) return "Yes";
  if (row.done === false) return "No";
  return displayOverTargetText(row.done_raw);
}

export function displayOverTargetSyncStatus(status: OverTargetSheetSyncStatus): string {
  if (status === "synced") return "Synced";
  if (status === "pending") return "Pending";
  if (status === "failed") return "Failed";
  return "Imported";
}

export function overTargetSearchHaystack(
  row: OverTargetRow & { home_team?: string | null; away_team?: string | null }
): string {
  return [
    row.match_external_id,
    displayOverTargetWeek(row),
    row.week_date ?? "",
    row.hr_code,
    row.collector_name ?? "",
    row.team ?? "",
    row.home_team ?? "",
    row.away_team ?? "",
    displayOverTargetCount(row),
    displayOverTargetDone(row),
    displayOverTargetSyncStatus(row.sheet_sync_status),
    row.sheet_sync_status,
  ]
    .join(" ")
    .toLowerCase();
}

export function filterOverTargetRecords(
  records: OverTargetRow[],
  query: string,
  syncStatus: OverTargetSheetSyncStatus | "all" = "all"
): OverTargetRow[] {
  const normalized = query.trim().toLowerCase();
  return records.filter((row) => {
    if (syncStatus !== "all" && row.sheet_sync_status !== syncStatus) return false;
    if (!normalized) return true;
    return overTargetSearchHaystack(row).includes(normalized);
  });
}

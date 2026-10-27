import { redirect } from "next/navigation";
import { BonusResolutionControl } from "@/components/BonusResolutionControl";
import { BonusDeleteControl } from "@/components/BonusDeleteControl";
import { getAllBonusRecords } from "@/lib/bonus/sheet";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import { BonusLiveRefresh } from "@/components/BonusLiveRefresh";

export const runtime = "nodejs";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MDY_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function display(value: string | null | undefined): string {
  return value && value.trim() ? value : "—";
}

/** Parse the sheet's M/D/YYYY format into a timezone-free ISO calendar date. */
function parseBonusFilterDate(value: string | undefined): string {
  const input = value?.trim() ?? "";
  if (!input) return "";

  const iso = ISO_DATE.exec(input);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
      ? input
      : "";
  }

  const mdy = MDY_DATE.exec(input);
  if (!mdy) return "";
  const month = Number(mdy[1]);
  const day = Number(mdy[2]);
  const year = Number(mdy[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function formatBonusDateInput(value: string): string {
  const match = ISO_DATE.exec(value);
  return match ? `${Number(match[2])}/${Number(match[3])}/${match[1]}` : "";
}

function displayDate(value: string | null, raw: string): string {
  if (value) return formatBonusDateInput(value);
  // Preserve the raw value if it cannot be normalized, rather than guessing its date order.
  return display(raw);
}

/**
 * Applies the date range filter to Bonus records.
 *
 * The filter compares actual Bonus Date field values (which are in
 * ISO 8601 YYYY-MM-DD format after parsing from Google Sheets).
 *
 * - Records with no date (record.date is null) do NOT pass the filter
 *   when either `from` or `to` is specified.
 * - Records with valid dates are compared as strings (ISO 8601 is
 *   lexicographically sortable).
 * - Both `from` and `to` dates are INCLUSIVE.
 */
function filterBonusByDateRange(
  records: typeof import("@/lib/bonus/sheet").getAllBonusRecords extends () => Promise<infer T> ? T : never,
  from: string,
  to: string
) {
  if (!from && !to) return records;

  return records.filter((record) => {
    // If neither from nor to is set, include all records.
    if (!from && !to) return true;

    // If either filter is set but the record has no date, exclude it.
    if (!record.date) return false;

    // Check lower bound (inclusive).
    if (from && record.date < from) return false;

    // Check upper bound (inclusive).
    if (to && record.date > to) return false;

    return true;
  });
}

export default async function AdminBonusPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  const profile = await getProfileOrRedirect();
  if (profile.role !== "admin") {
    redirect("/collector");
  }

  const from = parseBonusFilterDate(searchParams.from);
  const to = parseBonusFilterDate(searchParams.to);

  const allRecords = await getAllBonusRecords();
  const records = filterBonusByDateRange(allRecords, from, to);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-chalk-50">Bonus</h1>
        <p className="mt-1 text-sm text-chalk-200">
          All Bonus submissions. Amount is calculated by Google Sheets; Admin controls Resolution.
        </p>
        <div className="mt-2">
          <BonusLiveRefresh />
        </div>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="block text-sm text-chalk-200">
          From Date
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="mt-1 block rounded-[8px] border border-pitch-700 bg-pitch-900 px-3 py-2 text-sm text-chalk-50"
          />
        </label>
        <label className="block text-sm text-chalk-200">
          To Date
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="mt-1 block rounded-[8px] border border-pitch-700 bg-pitch-900 px-3 py-2 text-sm text-chalk-50"
          />
        </label>
        <button
          type="submit"
          className="rounded-card border border-clock-amber bg-clock-amber/10 px-4 py-2 text-sm font-semibold text-clock-amber transition-colors hover:bg-clock-amber/20"
        >
          Filter
        </button>
        {(from || to) && (
          <a
            href="/admin/bonus"
            className="text-sm text-chalk-200 underline-offset-2 hover:underline"
          >
            Clear
          </a>
        )}
      </form>

      <p className="text-sm text-chalk-200">Showing {records.length} of {allRecords.length} Bonus records.</p>

      {records.length === 0 ? (
        <p className="rounded-card border border-dashed border-pitch-700 px-4 py-6 text-center text-sm text-chalk-200">
          No Bonus records found.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-pitch-700">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-pitch-800 text-xs uppercase tracking-wide text-chalk-200">
              <tr>
                <th className="whitespace-nowrap px-3 py-3 font-medium">HR-Code</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Collector</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Reason</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Task</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Match ID</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Home Team</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Away Team</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Date</th>
                <th className="min-w-[220px] px-3 py-3 font-medium">Comment</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Amount</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Resolution</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pitch-800">
              {records.map((record) => (
                <tr key={record.row_number} className="bg-pitch-900 text-chalk-50">
                  <td className="whitespace-nowrap px-3 py-3 font-mono">{display(record.hr_code)}</td>
                  <td className="whitespace-nowrap px-3 py-3">{display(record.collector)}</td>
                  <td className="whitespace-nowrap px-3 py-3">{display(record.reason)}</td>
                  <td className="whitespace-nowrap px-3 py-3">{display(record.task)}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono">{display(record.match_id)}</td>
                  <td className="whitespace-nowrap px-3 py-3">{display(record.home_team)}</td>
                  <td className="whitespace-nowrap px-3 py-3">{display(record.away_team)}</td>
                  <td className="whitespace-nowrap px-3 py-3">{displayDate(record.date, record.date_raw)}</td>
                  <td className="max-w-sm whitespace-pre-wrap break-words px-3 py-3">{display(record.comment)}</td>
                  <td className="whitespace-nowrap px-3 py-3">{record.amount ?? "Pending"}</td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <BonusResolutionControl
                      bonus={{
                        rowNumber: record.row_number,
                        hrCode: record.hr_code,
                        matchId: record.match_id,
                        reason: record.reason,
                        task: record.task,
                        date: record.date,
                      }}
                      resolution={record.resolution}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <BonusDeleteControl
                      bonus={{
                        rowNumber: record.row_number,
                        hrCode: record.hr_code,
                        matchId: record.match_id,
                        reason: record.reason,
                        task: record.task,
                        date: record.date,
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

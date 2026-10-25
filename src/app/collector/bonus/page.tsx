import { getBonusRecordsForHrCode } from "@/lib/bonus/sheet";
import { CollectorBonusDeleteControl } from "@/components/CollectorBonusDeleteControl";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";

export const runtime = "nodejs";

function display(value: string | null | undefined): string {
  return value && value.trim() ? value : "—";
}

function displayDate(value: string | null, raw: string): string {
  if (value) {
    const [year, month, day] = value.split("-");
    if (year && month && day) return `${day}/${month}/${year}`;
  }
  return display(raw);
}

export default async function CollectorBonusPage() {
  const profile = await getProfileOrRedirect();
  const records = await getBonusRecordsForHrCode(profile.hr_code);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-chalk-50">My Bonus</h1>
        <p className="mt-1 text-sm text-chalk-200">
          Bonus submissions matching your HR-Code. Amount and Resolution are managed by Google Sheets and Admin.
        </p>
      </div>

      {!profile.hr_code && (
        <p className="rounded-card border border-pitch-700 bg-pitch-900 px-4 py-3 text-sm text-chalk-200">
          No HR-Code is set on this account, so no Bonus records can be matched.
        </p>
      )}

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Bonus summary">
        <div className="rounded-card border border-pitch-700 bg-pitch-900 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-pitch-500">My submissions</p>
          <p className="mt-2 font-display text-2xl text-chalk-50">{records.length}</p>
          <p className="mt-1 text-xs text-chalk-200">Records matched to your HR-Code</p>
        </div>
        <div className="rounded-card border border-pitch-700 bg-pitch-900 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-pitch-500">Amount pending</p>
          <p className="mt-2 font-display text-2xl text-clock-amber">{records.filter((record) => record.amount === null || record.amount === undefined || String(record.amount).trim() === "").length}</p>
          <p className="mt-1 text-xs text-chalk-200">Awaiting an amount entry</p>
        </div>
        <div className="rounded-card border border-pitch-700 bg-pitch-900 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-pitch-500">Resolution pending</p>
          <p className="mt-2 font-display text-2xl text-clock-amber">{records.filter((record) => record.resolution === null || record.resolution === undefined || String(record.resolution).trim() === "").length}</p>
          <p className="mt-1 text-xs text-chalk-200">Awaiting an admin update</p>
        </div>
      </section>
      <p className="text-sm text-chalk-200">Showing {records.length} Bonus record{records.length === 1 ? "" : "s"}.</p>

      {records.length === 0 ? (
        <p className="rounded-card border border-dashed border-pitch-700 px-4 py-6 text-center text-sm text-chalk-200">
          No Bonus records found.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-pitch-700 bg-pitch-900 shadow-sm">
          <table className="min-w-full text-left text-sm">
            <caption className="sr-only">Bonus submissions associated with your HR-Code</caption>
            <thead className="sticky top-0 bg-pitch-800 text-xs uppercase tracking-wide text-chalk-200">
              <tr>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Match ID</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Reason</th>
                <th className="whitespace-nowrap px-3 py-3 font-medium">Task</th>
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
                <tr key={record.row_number} className="bg-pitch-900 text-chalk-50 transition-colors hover:bg-pitch-800/70">
                  <td className="whitespace-nowrap px-3 py-3 font-mono">{display(record.match_id)}</td>
                  <td className="whitespace-nowrap px-3 py-3">{display(record.reason)}</td>
                  <td className="whitespace-nowrap px-3 py-3">{display(record.task)}</td>
                  <td className="whitespace-nowrap px-3 py-3">{display(record.home_team)}</td>
                  <td className="whitespace-nowrap px-3 py-3">{display(record.away_team)}</td>
                  <td className="whitespace-nowrap px-3 py-3">{displayDate(record.date, record.date_raw)}</td>
                  <td className="max-w-sm whitespace-pre-wrap break-words px-3 py-3">{display(record.comment)}</td>
                  <td className="whitespace-nowrap px-3 py-3">
                    {record.amount === null || record.amount === undefined || String(record.amount).trim() === "" ? (
                      <span className="inline-flex rounded-full border border-clock-amber/40 bg-clock-amber/10 px-2.5 py-1 text-xs font-medium text-clock-amber">Pending</span>
                    ) : display(String(record.amount))}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    {record.resolution === null || record.resolution === undefined || String(record.resolution).trim() === "" ? (
                      <span className="inline-flex rounded-full border border-clock-amber/40 bg-clock-amber/10 px-2.5 py-1 text-xs font-medium text-clock-amber">Pending</span>
                    ) : display(String(record.resolution))}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    {profile.role === "collector" && (
                      <CollectorBonusDeleteControl
                        bonus={{
                          rowNumber: record.row_number,
                          hrCode: record.hr_code,
                          matchId: record.match_id,
                          reason: record.reason,
                          task: record.task,
                          date: record.date,
                        }}
                      />
                    )}
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

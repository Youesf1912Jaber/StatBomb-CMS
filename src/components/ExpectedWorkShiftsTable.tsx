import { EXPECTED_WORK_SHIFTS } from "@/lib/expected/view";

export function ExpectedWorkShiftsTable() {
  return (
    <section className="rounded-card border border-pitch-700 bg-pitch-900 p-5">
      <h2 className="font-display text-lg text-chalk-50">Work Shifts</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-pitch-800 text-xs uppercase tracking-wide text-chalk-200">
            <tr>
              <th className="whitespace-nowrap px-3 py-3 font-medium">Work Shifts</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">Start</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">End</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-pitch-800">
            {EXPECTED_WORK_SHIFTS.map((shift) => (
              <tr key={shift.name} className="text-chalk-50">
                <td className="whitespace-nowrap px-3 py-3">{shift.name}</td>
                <td className="whitespace-nowrap px-3 py-3">{shift.start}</td>
                <td className="whitespace-nowrap px-3 py-3">{shift.end}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

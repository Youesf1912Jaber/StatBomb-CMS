import { createClient } from "@/lib/supabase/server";
import { getAdminDashboardAssignments } from "@/lib/assignments/queries";
import { AssignmentTable } from "@/components/AssignmentTable";
import { getCairoToday } from "@/lib/dates";
import { RefreshDistributionButton } from "./RefreshDistributionButton";

export const runtime = "nodejs";

const CURRENT_SHIFT_STATUS_ORDER = ["Completed", "In Progress", "Overdue"] as const;
const CURRENT_SHIFT_SECTION_LABELS = {
  Completed: "Completed",
  "In Progress": "In Progress",
  Overdue: "Overdue / SLA Broken",
} as const;

export default async function AdminDashboardPage() {
  const supabase = createClient();
  const assignments = await getAdminDashboardAssignments(supabase);
  const currentShiftDate = getCairoToday();
  const currentShiftAssignments = assignments.filter(
    (assignment) => assignment.shift_date === currentShiftDate
  );
  const allDistributedAssignments = assignments;

  const collectorIds = [...new Set(assignments.map((a) => a.collector_id))];
  const collectorNames: Record<string, string> = {};
  if (collectorIds.length > 0) {
    const { data: collectors } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", collectorIds);
    for (const c of collectors ?? []) {
      collectorNames[c.id] = c.full_name ?? c.email;
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl text-chalk-50">Dashboard</h1>
          <p className="mt-1 text-sm text-chalk-200">
            Assignment and match visibility. Historical assignments remain after a Distribution row
            is removed; In Progress work stays visible.
          </p>
        </div>
        <RefreshDistributionButton />
      </div>

      <section className="space-y-6">
        <div>
          <h2 className="font-display text-lg text-chalk-50">Current Shift</h2>
          <p className="mt-1 text-sm text-chalk-200">
            Assignments scheduled for {currentShiftDate}.
          </p>
        </div>
        {CURRENT_SHIFT_STATUS_ORDER.map((status) => {
          const statusAssignments = currentShiftAssignments.filter(
            (assignment) => assignment.status === status
          );

          return (
            <section key={status}>
              <h3 className="mb-2 font-display text-base text-chalk-50">
                {CURRENT_SHIFT_SECTION_LABELS[status]}{" "}
                <span className="text-sm text-chalk-200">({statusAssignments.length})</span>
              </h3>
              <AssignmentTable
                assignments={statusAssignments}
                detailsBasePath="/admin/assignments"
                showCollector
                collectorNames={collectorNames}
                showFilters={false}
                realtimeRefresh={false}
              />
            </section>
          );
        })}
      </section>

      <section>
        <h2 className="font-display text-lg text-chalk-50">All Distributed Matches</h2>
        <p className="mb-2 text-sm text-chalk-200">
          {allDistributedAssignments.length} assignment
          {allDistributedAssignments.length === 1 ? "" : "s"} across all collectors and shifts.
        </p>
        {allDistributedAssignments.length === 0 ? (
          <div className="rounded-card border border-dashed border-pitch-700 px-6 py-16 text-center">
            <p className="text-sm text-chalk-200">
              No matches or assignments yet — these are populated by the sync pipeline in a later
              phase, or can be created directly via the <code>create_assignment</code> RPC in the
              meantime.
            </p>
          </div>
        ) : (
          <AssignmentTable
            assignments={allDistributedAssignments}
            detailsBasePath="/admin/assignments"
            showCollector
            collectorNames={collectorNames}
            liveRefresh
          />
        )}
      </section>
    </div>
  );
}

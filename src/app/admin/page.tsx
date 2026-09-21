import { createClient } from "@/lib/supabase/server";
import { getAllAssignments } from "@/lib/assignments/queries";
import { AssignmentTable } from "@/components/AssignmentTable";

const STATUS_ORDER = ["In Progress", "Not Started", "Completed"] as const;

export default async function AdminDashboardPage() {
  const supabase = createClient();
  const assignments = await getAllAssignments(supabase);

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

  const counts = STATUS_ORDER.reduce<Record<string, number>>((acc, status) => {
    acc[status] = assignments.filter((a) => a.status === status).length;
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl text-chalk-50">Dashboard</h1>
        <p className="mt-1 text-sm text-chalk-200">
          Assignment and match visibility. Live SLA-warning/overdue monitoring and the Needs
          Attention panel land with the SLA scanner in Phase 3.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {STATUS_ORDER.map((status) => (
          <div key={status} className="rounded-card border border-pitch-700 bg-pitch-900 px-4 py-4">
            <p className="text-2xl font-display text-chalk-50">{counts[status] ?? 0}</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-chalk-200">{status}</p>
          </div>
        ))}
      </div>

      <section>
        <h2 className="font-display text-lg text-chalk-50">All Assignments</h2>
        <p className="mb-2 text-sm text-chalk-200">
          {assignments.length} assignment{assignments.length === 1 ? "" : "s"} across all collectors.
        </p>
        {assignments.length === 0 ? (
          <div className="rounded-card border border-dashed border-pitch-700 px-6 py-16 text-center">
            <p className="text-sm text-chalk-200">
              No matches or assignments yet — these are populated by the sync pipeline in a later
              phase, or can be created directly via the <code>create_assignment</code> RPC in the
              meantime.
            </p>
          </div>
        ) : (
          <AssignmentTable
            assignments={assignments}
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

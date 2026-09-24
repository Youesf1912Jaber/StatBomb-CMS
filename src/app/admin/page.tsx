import { createClient } from "@/lib/supabase/server";
import { getAllAssignments } from "@/lib/assignments/queries";
import { isOperationalAssignment } from "@/lib/assignments/distribution-presence";
import { AssignmentTable } from "@/components/AssignmentTable";
import { fetchAllMatches } from "@/lib/match-master-preview";
import { persistReconciledDistributionPresence } from "@/lib/sync/persist-distribution-presence";
import { readDistributionRowsForPreview } from "@/lib/sync/google-sheets";

const STATUS_ORDER = ["In Progress", "Not Started", "Completed"] as const;

export default async function AdminDashboardPage() {
  const supabase = createClient();
  try {
    const [distributionRows, matches, assignmentsResult] = await Promise.all([
      readDistributionRowsForPreview(),
      fetchAllMatches(supabase),
      supabase.from("assignments").select("*"),
    ]);
    if (assignmentsResult.error) throw assignmentsResult.error;
    await persistReconciledDistributionPresence(supabase, {
      distributionRows,
      assignments: assignmentsResult.data ?? [],
      matches,
    });
  } catch (error) {
    console.error("Failed to reconcile distribution presence for admin dashboard:", error);
  }
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

  const operationalAssignments = assignments.filter(isOperationalAssignment);
  const missingDistributionCount = assignments.filter((a) => !a.distribution_present).length;
  const counts = STATUS_ORDER.reduce<Record<string, number>>((acc, status) => {
    acc[status] = operationalAssignments.filter((a) => a.status === status).length;
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl text-chalk-50">Dashboard</h1>
        <p className="mt-1 text-sm text-chalk-200">
          Assignment and match visibility. Historical assignments remain after a Distribution row
          is removed; In Progress work stays visible.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {STATUS_ORDER.map((status) => (
          <div key={status} className="rounded-card border border-pitch-700 bg-pitch-900 px-4 py-4">
            <p className="text-2xl font-display text-chalk-50">{counts[status] ?? 0}</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-chalk-200">{status}</p>
          </div>
        ))}
        {missingDistributionCount > 0 && (
          <div className="rounded-card border border-clock-amber/40 bg-pitch-900 px-4 py-4">
            <p className="text-2xl font-display text-clock-amber">{missingDistributionCount}</p>
            <p className="mt-1 text-xs uppercase tracking-wide text-chalk-200">Distribution Missing</p>
          </div>
        )}
      </div>

      <section>
        <h2 className="font-display text-lg text-chalk-50">All Assignments</h2>
        <p className="mb-2 text-sm text-chalk-200">
          {assignments.length} assignment{assignments.length === 1 ? "" : "s"} across all collectors.
          Not Started rows removed from Distribution stay in history and are not current active Distribution assignments.
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

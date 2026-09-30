import { redirect } from "next/navigation";
import { DeductionsTable } from "@/components/DeductionsTable";
import { RefreshDeductionsButton } from "@/components/RefreshDeductionsButton";
import { getAllDeductions } from "@/lib/deductions/queries";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export default async function AdminDeductionsPage() {
  const profile = await getProfileOrRedirect();
  if (profile.role !== "admin") {
    redirect("/collector");
  }

  const supabase = createClient();
  const deductions = await getAllDeductions(supabase);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl text-chalk-50">Deductions</h1>
          <p className="mt-1 text-sm text-chalk-200">
            Read-only synchronized copy of Deduction2026. Refresh reads the official sheet and never writes back.
          </p>
        </div>
        <RefreshDeductionsButton endpoint="/api/admin/deductions/refresh" />
      </div>
      <p className="text-sm text-chalk-200">Total deductions: {deductions.length}</p>
      <DeductionsTable deductions={deductions} showCollector />
    </div>
  );
}

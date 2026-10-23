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
<a
          href="https://script.google.com/macros/s/AKfycbxWF7Iy4qRDsSdcTcN_jmKE5ANh8PrFD5sspdoOUHRF8C1hLglPtbmcQv7KmmrhClZ2/exec"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-lg border border-[#b89a45] bg-[#263a2b] px-4 py-2 text-sm font-semibold text-[#f1d77f] transition hover:border-[#e3c36b] hover:bg-[#344a34] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c36b]"
        >
          QA Dashboard
        </a>
        <RefreshDeductionsButton endpoint="/api/admin/deductions/refresh" />
      </div>
      <p className="text-sm text-chalk-200">Total deductions: {deductions.length}</p>
      <DeductionsTable deductions={deductions} showCollector />
    </div>
  );
}

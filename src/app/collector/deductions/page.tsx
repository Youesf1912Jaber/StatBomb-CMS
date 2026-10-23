import { DeductionsTable } from "@/components/DeductionsTable";
import { RefreshDeductionsButton } from "@/components/RefreshDeductionsButton";
import { getDeductionsForHrCode } from "@/lib/deductions/queries";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export default async function CollectorDeductionsPage() {
  const profile = await getProfileOrRedirect();
  const supabase = createClient();
  const deductions = await getDeductionsForHrCode(supabase, profile.hr_code);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl text-chalk-50">My Deductions</h1>
          <p className="mt-1 text-sm text-chalk-200">
            Only deductions matching your HR-Code. Refresh reads Deduction2026 through the server and never writes to the sheet.
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
        <RefreshDeductionsButton endpoint="/api/collector/deductions/refresh" />
      </div>
      {!profile.hr_code && (
        <p className="rounded-card border border-pitch-700 bg-pitch-900 px-4 py-3 text-sm text-chalk-200">
          No HR-Code is set on this account, so no deductions can be matched.
        </p>
      )}
      <p className="text-sm text-chalk-200">Your deductions: {deductions.length}</p>
      <DeductionsTable deductions={deductions} />
    </div>
  );
}

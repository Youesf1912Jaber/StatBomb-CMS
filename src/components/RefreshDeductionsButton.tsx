"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface RefreshDeductionsButtonProps {
  endpoint: "/api/admin/deductions/refresh" | "/api/collector/deductions/refresh";
}

export function RefreshDeductionsButton({ endpoint }: RefreshDeductionsButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshDeductions() {
    if (loading) return;
    setLoading(true);
    setSuccess(null);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        cache: "no-store",
      });
      const payload = await response.json() as {
        success?: boolean;
        inserted?: number;
        updated?: number;
        unchanged?: number;
        missing?: number;
        ownCount?: number;
        error?: string;
      };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Unable to refresh Deductions.");
      }
      if (typeof payload.ownCount === "number") {
        setSuccess(
          `Deductions refreshed. ${payload.ownCount} of yours. ${payload.inserted ?? 0} new, ${payload.updated ?? 0} updated.`
        );
      } else {
        setSuccess(
          `Deductions refreshed. ${payload.inserted ?? 0} new, ${payload.updated ?? 0} updated, ${payload.unchanged ?? 0} unchanged, ${payload.missing ?? 0} missing from source.`
        );
      }
      router.refresh();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to refresh Deductions.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void refreshDeductions()}
        disabled={loading}
        className="rounded-card border border-clock-amber bg-clock-amber/10 px-4 py-2 text-sm font-semibold text-clock-amber transition-colors hover:bg-clock-amber/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Refreshing..." : "Refresh Deductions"}
      </button>
      {success && (
        <p className="text-sm text-chalk-200">{success}</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-clock-red">{error}</p>
      )}
    </div>
  );
}

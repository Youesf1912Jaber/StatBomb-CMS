"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RefreshDistributionButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshDistribution() {
    if (loading) return;
    setLoading(true);
    setSuccess(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/distribution/refresh", {
        method: "POST",
        cache: "no-store",
      });
      const responseText = await response.text();
      let payload: {
        success?: boolean;
        present?: number;
        missing?: number;
        error?: string;
      } = {};
      try {
        payload = JSON.parse(responseText) as typeof payload;
      } catch {
        const detail = responseText.replace(/\\s+/g, " ").trim().slice(0, 240);
        throw new Error(
          detail
            ? `Refresh failed (HTTP ${response.status}): ${detail}`
            : `Refresh failed (HTTP ${response.status}) and returned an empty response.`
        );
      }
      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Unable to refresh Distribution.");
      }
      setSuccess(
        `Distribution refreshed. ${payload.present ?? 0} current, ${payload.missing ?? 0} missing.`
      );
      router.refresh();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to refresh Distribution.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void refreshDistribution()}
        disabled={loading}
        className="rounded-card border border-clock-amber bg-clock-amber/10 px-4 py-2 text-sm font-semibold text-clock-amber transition-colors hover:bg-clock-amber/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Refreshing..." : "Refresh Distribution"}
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

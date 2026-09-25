"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateDistributionDetails } from "@/lib/assignments/actions";

interface EditDistributionDetailsModalProps {
  assignmentId: string;
  shiftDate: string | null;
  officialWebsiteUrl: string | null;
  onClose: () => void;
}

function isValidUrl(url: string): boolean {
  if (url.trim() === "") return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function EditDistributionDetailsModal({
  assignmentId,
  shiftDate,
  officialWebsiteUrl,
  onClose,
}: EditDistributionDetailsModalProps) {
  const router = useRouter();
  const [nextShiftDate, setNextShiftDate] = useState(shiftDate ?? "");
  const [nextOfficialWebsiteUrl, setNextOfficialWebsiteUrl] = useState(officialWebsiteUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (nextShiftDate && !/^\d{4}-\d{2}-\d{2}$/.test(nextShiftDate)) {
      setError("Shift Date must be a valid date.");
      return;
    }

    if (!isValidUrl(nextOfficialWebsiteUrl)) {
      setError("Official Match URL must be a valid http or https address.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await updateDistributionDetails(
        assignmentId,
        nextShiftDate.trim() || null,
        nextOfficialWebsiteUrl.trim() || null
      );

      if (result.error) {
        setError(result.error);
        return;
      }

      setSuccess(true);
      router.refresh();
      setTimeout(() => {
        onClose();
      }, 1500);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg space-y-4 rounded-card border border-pitch-700 bg-pitch-900 p-6 shadow-xl">
        <h2 className="font-display text-xl text-chalk-50">Edit Distribution Details</h2>

        {success ? (
          <div className="rounded border border-green-700 bg-green-900/30 p-3 text-sm text-green-300">
            Distribution details updated successfully.
          </div>
        ) : (
          <>
            <div className="space-y-4 text-sm">
              <div>
                <label htmlFor="shift-date" className="block text-chalk-200">
                  Shift Date
                </label>
                <input
                  id="shift-date"
                  type="date"
                  value={nextShiftDate}
                  onChange={(e) => setNextShiftDate(e.target.value)}
                  className="mt-1 w-full rounded border border-pitch-700 bg-pitch-800 px-3 py-2 text-chalk-50 focus:border-clock-amber focus:outline-none disabled:opacity-50"
                  disabled={isPending}
                />
              </div>

              <div>
                <label htmlFor="official-match-url" className="block text-chalk-200">
                  Official Match URL
                </label>
                <input
                  id="official-match-url"
                  type="url"
                  value={nextOfficialWebsiteUrl}
                  onChange={(e) => setNextOfficialWebsiteUrl(e.target.value)}
                  className="mt-1 w-full rounded border border-pitch-700 bg-pitch-800 px-3 py-2 text-chalk-50 focus:border-clock-amber focus:outline-none disabled:opacity-50"
                  disabled={isPending}
                  placeholder="https://official-site.example/match/123"
                />
              </div>

              <div className="rounded border border-clock-amber/30 bg-clock-amber/10 p-3 text-xs text-clock-amber">
                <p className="font-semibold">Important:</p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  <li>Shift Date is independent from Match Date</li>
                  <li>Official Match URL is shared by every collector on this match</li>
                  <li>Saving does not change assignment status, SLA, or task timers</li>
                </ul>
              </div>
            </div>

            {error && (
              <div className="rounded border border-red-700 bg-red-900/30 p-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded border border-pitch-700 px-4 py-2 text-sm text-chalk-200 transition-colors hover:border-chalk-200 hover:text-chalk-50 disabled:opacity-50"
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className="flex-1 rounded bg-clock-amber px-4 py-2 text-sm font-semibold text-pitch-900 transition-colors hover:bg-clock-amber/80 disabled:opacity-50"
                disabled={isPending}
              >
                {isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

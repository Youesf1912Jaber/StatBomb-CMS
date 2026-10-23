"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addOfficialMatchUrl } from "@/lib/assignments/actions";

interface AddOfficialMatchButtonProps {
  assignmentId: string;
  officialWebsiteUrl: string | null;
}

export function AddOfficialMatchButton({
  assignmentId,
  officialWebsiteUrl,
}: AddOfficialMatchButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(officialWebsiteUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    const value = url.trim();
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setError("Enter a valid official http or https match URL.");
        return;
      }
    } catch {
      setError("Enter a valid official match URL, including https://.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await addOfficialMatchUrl(assignmentId, value);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSuccess(true);
      router.refresh();
      window.setTimeout(() => {
        setOpen(false);
        setSuccess(false);
      }, 1000);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setUrl(officialWebsiteUrl ?? "");
          setError(null);
          setSuccess(false);
          setOpen(true);
        }}
        className="inline-flex items-center rounded-md border border-clock-amber/60 bg-clock-amber px-3.5 py-2 text-xs font-bold text-pitch-950 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clock-amber"
      >
        Add Official Match ↗
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-official-match-title"
            className="w-full max-w-lg space-y-4 rounded-xl border border-pitch-700 bg-pitch-900 p-5 shadow-2xl sm:p-6"
          >
            <div>
              <h2 id="add-official-match-title" className="font-display text-xl font-semibold text-chalk-50">
                Add Official Match
              </h2>
              <p className="mt-1 text-sm text-chalk-200">
                Paste the official match page or timeline URL. It will be shared with every collector and the admin team for this match.
              </p>
            </div>

            {success ? (
              <div className="rounded border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                Official match URL saved and shared with the team.
              </div>
            ) : (
              <>
                <div>
                  <label htmlFor="collector-official-match-url" className="block text-sm font-medium text-chalk-200">
                    Official Match URL
                  </label>
                  <input
                    id="collector-official-match-url"
                    type="url"
                    inputMode="url"
                    autoComplete="url"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://www.uefa.com/..."
                    disabled={isPending}
                    className="mt-2 w-full rounded-md border border-pitch-700 bg-pitch-950 px-3 py-2.5 text-sm text-chalk-50 placeholder:text-chalk-300/60 focus:border-clock-amber focus:outline-none disabled:opacity-50"
                  />
                </div>
                {error && (
                  <p role="alert" className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
                    {error}
                  </p>
                )}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    disabled={isPending}
                    className="rounded-md border border-pitch-700 px-4 py-2 text-sm text-chalk-200 hover:border-chalk-200 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isPending || !url.trim()}
                    className="rounded-md bg-clock-amber px-4 py-2 text-sm font-bold text-pitch-950 hover:brightness-110 disabled:opacity-50"
                  >
                    {isPending ? "Saving..." : "Save Official URL"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

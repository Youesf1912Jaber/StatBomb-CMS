"use client";

export default function CollectorError({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl p-6">
      <div className="rounded-card border border-clock-red/40 bg-pitch-900 p-6">
        <h1 className="text-lg font-semibold text-chalk-50">Unable to load this page</h1>
        <p className="mt-2 text-sm text-chalk-200">Please try again.</p>
        <button
          onClick={reset}
          className="mt-4 rounded-card bg-clock-amber px-4 py-2 text-sm font-semibold text-ink"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

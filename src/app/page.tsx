import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-pitch-500">
          StatBomb
        </p>
        <h1 className="mt-2 font-display text-3xl text-chalk-50">
          Collector Management System
        </h1>
        <p className="mt-3 text-sm text-chalk-200">
          The operations console for match-data collection: assignments,
          SLAs, and reporting in one place.
        </p>
        <Link
          href="/login"
          className="mt-8 inline-block rounded-card bg-clock-amber px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-[#e3b45c]"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}

import CollectorImportClient from "./CollectorImportClient";

export default function CollectorsPage() {
  return (
    <section className="w-full min-w-0 space-y-6">
      <header className="relative isolate overflow-hidden rounded-2xl border border-pitch-600 bg-pitch-950">
        <div
          className="absolute inset-0 -z-20 bg-[url('/images/football/Collectors%20control%20room.webp')] bg-cover bg-center"
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 -z-10 bg-gradient-to-r from-pitch-950/95 via-pitch-950/85 to-pitch-950/45"
          aria-hidden="true"
        />
        <div className="flex min-h-[250px] items-center p-6 sm:min-h-[280px] sm:p-8 lg:min-h-[300px] lg:p-10">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-pitch-500/70 bg-pitch-950/60 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-chalk-200 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-pitch-400" /> Arqam Football Operations · People Management
            </p>
            <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.2em] text-pitch-300">Admin workspace</p>
            <h1 className="mt-2 font-display text-3xl text-chalk-50 sm:text-4xl">
              Collectors <span className="text-pitch-300">control room.</span>
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-chalk-100">
              Manage team profiles, account access, roster synchronization, and bulk collector provisioning from one place.
            </p>
          </div>
        </div>
      </header>
      <CollectorImportClient />
    </section>
  );
}

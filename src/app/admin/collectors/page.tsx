import CollectorImportClient from "./CollectorImportClient";

export default function CollectorsPage() {
  return (
    <section className="w-full min-w-0 space-y-6">
      <header className="relative isolate overflow-hidden rounded-2xl border border-pitch-600 bg-pitch-950">
        <div className="absolute inset-0 -z-20 bg-[url('/images/pitch-background-tactical.webp')] bg-cover bg-center" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-pitch-950 via-pitch-950/95 to-pitch-900/55" />
        <div className="grid min-h-[230px] items-center gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.6fr)]">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-pitch-500/70 bg-black/20 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-chalk-200">
              <span className="h-1.5 w-1.5 rounded-full bg-pitch-400" /> Arqam Football Operations · People Management
            </p>
            <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.2em] text-pitch-300">Admin workspace</p>
            <h1 className="mt-2 font-display text-3xl text-chalk-50 sm:text-4xl">
              Collectors <span className="text-pitch-300">control room.</span>
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-chalk-200">
              Manage team profiles, account access, roster synchronization, and bulk collector provisioning from one place.
            </p>
          </div>
          <div className="relative hidden min-h-[190px] overflow-hidden rounded-xl border border-pitch-500/60 bg-pitch-950 lg:block">
            <img
              src="/images/football/Collectors%20control%20room.webp"
              alt="Collectors control room"
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-pitch-950/95 via-pitch-950/15 to-pitch-950/10" />
            <div className="absolute inset-x-3 bottom-3 rounded-lg border border-chalk-100/20 bg-pitch-950/85 p-3 shadow-xl shadow-black/30 backdrop-blur-sm">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-pitch-300">Collectors control room</p>
              <p className="mt-1 font-display text-xl text-chalk-50">People. Access. Matchday.</p>
            </div>
          </div>
        </div>
      </header>
      <CollectorImportClient />
    </section>
  );
}

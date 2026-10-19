import CollectorImportClient from "./CollectorImportClient";

export default function CollectorsPage() {
  return (
    <section className="admin-collectors-page w-full min-w-0 space-y-6">
      <header className="relative isolate overflow-hidden rounded-2xl border border-pitch-600/80 bg-pitch-950 shadow-2xl shadow-black/20">
        <div
          className="absolute inset-0 -z-30 bg-[url('/images/football/Collectors%20control%20room.webp')] bg-cover bg-center"
          aria-hidden="true"
        />
        <div className="absolute inset-0 -z-20 bg-gradient-to-r from-pitch-950 via-pitch-950/95 to-pitch-950/45" aria-hidden="true" />
        <div className="absolute inset-0 -z-10 opacity-20" aria-hidden="true">
          <div className="absolute -right-16 -top-20 h-80 w-80 rounded-full border border-emerald-200/70" />
          <div className="absolute -right-3 -top-7 h-52 w-52 rounded-full border border-emerald-200/70" />
          <div className="absolute right-0 top-1/2 h-px w-[46%] bg-emerald-100/60" />
          <div className="absolute right-[22%] top-0 h-full w-px bg-emerald-100/40" />
          <div className="absolute right-[22%] top-1/2 h-28 w-16 -translate-y-1/2 rounded-r-full border border-emerald-100/60" />
        </div>
        <div className="flex min-h-[270px] flex-col justify-between gap-8 p-6 sm:min-h-[300px] sm:p-8 lg:flex-row lg:items-end lg:p-10">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-pitch-950/70 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100 backdrop-blur-sm">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" /> ARQAM · FOOTBALL OPERATIONS
              </span>
              <span className="rounded-full border border-clock-amber/40 bg-clock-amber/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-clock-amber">
                Admin · Team Management
              </span>
            </div>
            <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.24em] text-emerald-100/70">Club headquarters / Squad office</p>
            <h1 className="mt-2 font-display text-3xl leading-tight text-chalk-50 sm:text-4xl lg:text-5xl">
              Team <span className="text-clock-amber">management.</span>
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-chalk-100/90 sm:text-base">
              Your squad, your operations. Manage collector profiles, access, team-sheet sync and account setup from one match-day control room.
            </p>
          </div>
          <div className="grid w-full max-w-sm grid-cols-2 gap-3 lg:w-[280px] lg:shrink-0">
            <div className="rounded-xl border border-white/10 bg-pitch-950/70 p-4 backdrop-blur-sm">
              <p className="font-mono text-[10px] uppercase tracking-widest text-chalk-300">Workspace</p>
              <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-chalk-50"><span className="text-clock-amber">◆</span> Squad office</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-pitch-950/70 p-4 backdrop-blur-sm">
              <p className="font-mono text-[10px] uppercase tracking-widest text-chalk-300">Mode</p>
              <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-emerald-200"><span className="h-2 w-2 rounded-full bg-emerald-300" /> Operations</p>
            </div>
          </div>
        </div>
        <div className="h-1 w-full bg-gradient-to-r from-emerald-400 via-clock-amber to-transparent" />
      </header>
      <CollectorImportClient />
    </section>
  );
}

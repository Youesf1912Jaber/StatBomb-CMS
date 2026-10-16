import CollectorImportClient from "./CollectorImportClient";

export default function CollectorsPage() {
  return (
    <section className="w-full min-w-0 space-y-6">
      <header className="relative overflow-hidden rounded-2xl border border-pitch-600 bg-[linear-gradient(110deg,rgba(2,28,25,0.98),rgba(3,61,52,0.88)),url('/images/pitch-background-tactical.webp')] bg-cover bg-center p-6 sm:p-8">
        <div className="max-w-3xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-pitch-500/70 bg-black/20 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-chalk-200"><span className="h-1.5 w-1.5 rounded-full bg-pitch-400" /> Arqam Football Operations · People Management</p>
          <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.2em] text-pitch-300">Admin workspace</p>
          <h1 className="mt-2 font-display text-3xl text-chalk-50 sm:text-4xl">Collectors <span className="text-pitch-300">control room.</span></h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-chalk-200">Manage team profiles, account access, roster synchronization, and bulk collector provisioning from one place.</p>
        </div>
      </header>
      <CollectorImportClient />
    </section>
  );
}

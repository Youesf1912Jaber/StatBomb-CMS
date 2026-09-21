import CollectorImportClient from "./CollectorImportClient";

export default function CollectorsPage() {
  return (
    <section className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-pitch-400">Administration</p>
        <h1 className="mt-2 font-display text-3xl text-chalk-50">Collectors</h1>
        <p className="mt-2 text-sm text-chalk-300">Preview and provision operational collectors by HR-Code.</p>
      </div>
      <CollectorImportClient />
    </section>
  );
}

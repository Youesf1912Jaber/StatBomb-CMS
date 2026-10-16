import type { HyperCareTeamSection } from "@/lib/hyper-care/parse";

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-chalk-300">{label}</dt>
      <dd className="mt-1 break-words text-sm leading-5 text-chalk-50">{value}</dd>
    </div>
  );
}

function TeamBlock({ section }: { section: HyperCareTeamSection }) {
  return (
    <article className="relative min-w-0 overflow-hidden rounded-xl border border-pitch-700 bg-pitch-950/80">
      <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-clock-amber to-pitch-500" />
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-pitch-700/80 px-4 py-3 pl-5 sm:px-5 sm:pl-6">
        <h3 className="font-display text-base font-semibold text-chalk-50">{section.team_name}</h3>
        <span className="rounded-full border border-pitch-600 bg-pitch-800 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-chalk-200">
          Team details
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 p-4 pl-5 sm:grid-cols-2 sm:p-5 sm:pl-6">
        {section.customer_care && (
          <section className="min-w-0">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-clock-amber">Customer Care</h4>
            <dl className="grid grid-cols-1 gap-3">
              <Field label="Review Type" value={section.customer_care.review_type} />
              <Field label="Review Events" value={section.customer_care.review_events} />
              <Field label="Completed by" value={section.customer_care.completed_by} />
            </dl>
          </section>
        )}
        {section.team_request && (
          <section className={`min-w-0 ${section.customer_care ? "border-t border-pitch-700 pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0" : ""}`}>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-clock-amber">Team Request</h4>
            <dl className="grid grid-cols-1 gap-3">
              <Field label="Request" value={section.team_request.request} />
              <Field label="Gender" value={section.team_request.gender} />
            </dl>
          </section>
        )}
        {!section.customer_care && !section.team_request && (
          <p className="text-sm text-chalk-300">No additional Hyper Care details are available.</p>
        )}
      </div>
    </article>
  );
}

export function HyperCareSection({ sections }: { sections: HyperCareTeamSection[] }) {
  if (sections.length === 0) return null;

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-pitch-700 bg-pitch-950/90 shadow-lg shadow-black/10">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-pitch-700 bg-pitch-900/90 px-4 py-4 sm:px-5">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="h-8 w-1 rounded-full bg-clock-amber" />
          <div>
            <h2 className="font-display text-lg font-semibold tracking-wide text-chalk-50">Hyper Care</h2>
            <p className="mt-0.5 text-xs text-chalk-300">Special review notes and team requests</p>
          </div>
        </div>
        <span className="rounded-full border border-clock-amber/30 bg-clock-amber/10 px-3 py-1 text-xs font-semibold text-clock-amber">
          {sections.length} {sections.length === 1 ? "team" : "teams"}
        </span>
      </header>
      <div className="space-y-3 p-3 sm:p-4">
        {sections.map((section) => (
          <TeamBlock key={`${section.side}-${section.team_name}`} section={section} />
        ))}
      </div>
    </section>
  );
}

import type { HyperCareTeamSection } from "@/lib/hyper-care/parse";

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-black/15 px-2.5 py-2">
      <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-chalk-300">{label}</dt>
      <dd className="mt-1 break-words text-xs font-semibold leading-4 text-white">{value}</dd>
    </div>
  );
}

function TeamBlock({ section }: { section: HyperCareTeamSection }) {
  return (
    <article className="relative min-w-0 overflow-hidden rounded-xl border border-amber-400/35 bg-gradient-to-br from-[#123b35] via-pitch-900 to-[#071e1b] shadow-[0_6px_18px_rgba(0,0,0,0.16)]">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-300 via-amber-500 to-emerald-400" />
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-black/15 px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-amber-300/30 bg-amber-300/10 text-amber-200">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m16 0v-2a4 4 0 0 0-3-3.87M14 3.13a4 4 0 0 1 0 7.75M10 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-200">Flagged team</p>
            <h3 className="mt-0.5 break-words font-display text-base font-semibold text-white">{section.team_name}</h3>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-300/10 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.12em] text-amber-100">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.8)]" />
          Hyper Care
        </span>
      </div>
      <div className="grid grid-cols-1 gap-1.5 p-2 sm:grid-cols-2 sm:p-3">
        {section.customer_care && (
          <section className="min-w-0 rounded-lg border border-amber-300/30 bg-[#071f1c]/75 p-2.5">
            <h4 className="mb-2 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-amber-200">
              <span aria-hidden="true" className="h-5 w-1 rounded-full bg-amber-300" />
              Customer Care
            </h4>
            <dl className="grid grid-cols-1 gap-2">
              <Field label="Review Type" value={section.customer_care.review_type} />
              <Field label="Review Events" value={section.customer_care.review_events} />
              <Field label="Completed by" value={section.customer_care.completed_by} />
            </dl>
          </section>
        )}
        {section.team_request && (
          <section className="min-w-0 rounded-lg border border-emerald-400/25 bg-[#071f1c]/75 p-2.5">
            <h4 className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-emerald-200">
              <span aria-hidden="true" className="h-5 w-1 rounded-full bg-emerald-300" />
              Team Request
            </h4>
            <dl className="grid grid-cols-1 gap-2">
              <Field label="Request" value={section.team_request.request} />
              <Field label="Gender" value={section.team_request.gender} />
            </dl>
          </section>
        )}
        {!section.customer_care && !section.team_request && (
          <p className="text-sm text-chalk-200">No additional Hyper Care details are available.</p>
        )}
      </div>
    </article>
  );
}

export function HyperCareSection({ sections }: { sections: HyperCareTeamSection[] }) {
  if (sections.length === 0) return null;

  return (
    <section className="relative min-w-0 overflow-hidden rounded-xl border border-amber-400/55 bg-[#061b18]/95 shadow-[0_8px_26px_rgba(0,0,0,0.22)] ring-1 ring-amber-300/10">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-300 via-amber-500 to-emerald-400" />
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-300/20 bg-gradient-to-r from-amber-300/10 via-transparent to-emerald-300/10 px-3 py-3 sm:px-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-300/40 bg-amber-300/10 text-amber-200 shadow-inner">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 20 7v5c0 5-3.4 8-8 9-4.6-1-8-4-8-9V7l8-4Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="m9 12 2 2 4-4" />
            </svg>
          </span>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-amber-200">Priority match notes</p>
            <h2 className="font-display text-lg font-bold tracking-wide text-white">HYPER CARE</h2>
            <p className="mt-0.5 text-xs text-chalk-200">Special review notes and team requests</p>
          </div>
        </div>
        <div className="rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-1.5 text-right">
          <p className="text-xl font-black leading-none text-amber-200">{sections.length}</p>
          <p className="mt-1 text-[9px] font-extrabold uppercase tracking-[0.14em] text-amber-100">{sections.length === 1 ? "Flagged team" : "Flagged teams"}</p>
        </div>
      </header>
      <div className="space-y-2 p-2 sm:p-3">
        {sections.map((section) => (
          <TeamBlock key={`${section.side}-${section.team_name}`} section={section} />
        ))}
      </div>
    </section>
  );
}

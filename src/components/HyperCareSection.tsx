import type { HyperCareTeamSection } from "@/lib/hyper-care/parse";

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <p className="text-sm text-chalk-50">
      <span className="text-chalk-200">{label}:</span> {value}
    </p>
  );
}

function TeamBlock({ section }: { section: HyperCareTeamSection }) {
  return (
    <div className="rounded-card border border-red-900/60 bg-red-950/30 p-4">
      <h3 className="font-display text-base text-chalk-50">{section.team_name}</h3>
      {section.customer_care && (
        <div className="mt-3 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-chalk-200">Customer Care</p>
          <Field label="Review Type" value={section.customer_care.review_type} />
          <Field label="Review Events" value={section.customer_care.review_events} />
          <Field label="Completed by" value={section.customer_care.completed_by} />
        </div>
      )}
      {section.team_request && (
        <div className="mt-3 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-chalk-200">Team Request</p>
          <Field label="Request" value={section.team_request.request} />
          <Field label="Gender" value={section.team_request.gender} />
        </div>
      )}
    </div>
  );
}

export function HyperCareSection({ sections }: { sections: HyperCareTeamSection[] }) {
  if (sections.length === 0) return null;

  return (
    <section className="space-y-3 rounded-card border border-red-800 bg-pitch-900 p-5">
      <h2 className="font-display text-lg text-red-200">HYPER CARE</h2>
      {sections.map((section) => (
        <TeamBlock key={`${section.side}-${section.team_name}`} section={section} />
      ))}
    </section>
  );
}

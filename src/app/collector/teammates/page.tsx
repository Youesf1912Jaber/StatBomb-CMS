import { createClient } from "@/lib/supabase/server";
import { getCollectorTeammates } from "@/lib/assignments/queries";

function toWhatsAppNumber(phone: string) {
  // wa.me expects digits only, with the international country code and no "+".
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);

  // The roster stores Egyptian mobile numbers without the country code.
  if (digits.length === 10 && digits.startsWith("1")) digits = `20${digits}`;
  return digits;
}

export default async function MyTeammatesPage() {
  const supabase = createClient();
  const teammates = await getCollectorTeammates(supabase);

  return (
    <section className="max-w-5xl space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-pitch-500">Collector Directory</p>
        <h1 className="mt-2 font-display text-3xl text-chalk-50">My Teammates</h1>
        <p className="mt-2 text-sm text-chalk-300">
          Contact details from the collector roster, matching the information maintained in the Batch sheet.
        </p>
      </div>

      <div className="rounded-card border border-pitch-700 bg-pitch-900 px-4 py-3 text-sm text-chalk-200">
        {teammates.length} collectors in the directory
      </div>

      {teammates.length === 0 ? (
        <p className="rounded-card border border-dashed border-pitch-700 px-4 py-8 text-center text-sm text-chalk-200">
          No teammate records found.
        </p>
      ) : (
        <div className="overflow-hidden rounded-card border border-pitch-700">
          <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(110px,0.8fr)_minmax(130px,1fr)_minmax(100px,0.8fr)] gap-4 bg-pitch-900 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-chalk-300 sm:grid">
            <span>Collector name</span>
            <span>HR-Code</span>
            <span>WhatsApp</span>
            <span>Team</span>
          </div>
          <ul className="divide-y divide-pitch-800">
            {teammates.map((teammate) => {
              const whatsappNumber = teammate.phone ? toWhatsAppNumber(teammate.phone) : "";
              return (
                <li key={teammate.id} className="grid gap-2 bg-pitch-950 px-4 py-4 sm:grid-cols-[minmax(0,1.5fr)_minmax(110px,0.8fr)_minmax(130px,1fr)_minmax(100px,0.8fr)] sm:items-center sm:gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-chalk-50">{teammate.full_name || "Unnamed collector"}</p>
                    <p className="mt-1 text-xs text-chalk-400 sm:hidden">Collector</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-chalk-400 sm:hidden">HR-Code</p>
                    <p className="break-words font-mono text-sm text-chalk-200">{teammate.hr_code || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-chalk-400 sm:hidden">WhatsApp message</p>
                    {whatsappNumber ? (
                      <a
                        className="inline-flex items-center gap-2 text-sm text-clock-amber underline decoration-pitch-600 underline-offset-2 hover:text-chalk-50"
                        href={`https://wa.me/${whatsappNumber}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Message ${teammate.full_name || "teammate"} on WhatsApp`}
                      >
                        <span aria-hidden="true">▣</span>
                        <span>{teammate.phone}</span>
                      </a>
                    ) : (
                      <p className="text-sm text-chalk-400">—</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] text-chalk-400 sm:hidden">Team</p>
                    <p className="text-sm text-chalk-200">{teammate.team || "—"}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

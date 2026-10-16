import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { getCollectorTeammates } from "@/lib/assignments/queries";

export default async function MyTeammatesPage() {
  const supabase = createClient();
  const teammates = await getCollectorTeammates(supabase);

  return (
    <section className="w-full max-w-none space-y-6">
      <header className="relative isolate flex min-h-[190px] items-end overflow-hidden rounded-2xl border border-pitch-700 bg-[#021a19] p-6 shadow-xl shadow-black/10 sm:min-h-[220px] sm:p-8 lg:p-10">
        <Image
          src="/images/football/locker-room-wide.webp"
          alt=""
          fill
          priority
          sizes="(max-width: 768px) 100vw, calc(100vw - 18rem)"
          className="object-cover object-center"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-[#021a19]/95 via-[#021a19]/75 to-[#021a19]/20" />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#021a19]/80 via-transparent to-[#021a19]/10" />
        <div aria-hidden="true" className="absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r from-clock-amber via-pitch-500 to-transparent" />
        <div className="relative z-10 max-w-3xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/25 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-clock-amber backdrop-blur-sm">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-clock-amber" />
            The squad · Collector directory
          </p>
          <h1 className="mt-4 font-display text-3xl text-white sm:text-4xl lg:text-5xl">My Teammates</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/85 sm:text-base">
            Your matchday crew, all in one place. Find a collector and contact them when you need to coordinate.
          </p>
        </div>
        <div className="absolute right-5 top-5 hidden rounded-xl border border-white/20 bg-[#021a19]/70 px-4 py-3 text-right text-white backdrop-blur-md sm:block">
          <p className="font-mono text-2xl font-semibold">{teammates.length}</p>
          <p className="text-[10px] uppercase tracking-[0.15em] text-white/70">Collectors</p>
        </div>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl text-chalk-50">Squad directory</h2>
          <p className="mt-1 text-sm text-chalk-200">Contact details shown according to the information available to your account.</p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-pitch-700 bg-pitch-900/80 px-4 py-2 text-sm text-chalk-100">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-400" />
          {teammates.length} {teammates.length === 1 ? "collector" : "collectors"} in the directory
        </div>
      </div>

      {teammates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-pitch-700 bg-pitch-900/60 px-5 py-12 text-center">
          <p className="font-display text-xl text-chalk-50">No teammate records yet</p>
          <p className="mt-2 text-sm text-chalk-200">When collector records are available, they will appear here.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-pitch-700 bg-pitch-950/90 shadow-xl shadow-black/10">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pitch-700 bg-pitch-900/90 px-4 py-4 sm:px-6">
            <div>
              <p className="text-sm font-semibold text-chalk-50">Collector contacts</p>
              <p className="mt-1 text-xs text-chalk-200">Tap a number to compose a text message to a teammate.</p>
            </div>
            <span className="rounded-md border border-pitch-600/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-chalk-200">Matchday operations</span>
          </div>
          <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(110px,0.75fr)_minmax(150px,1fr)_minmax(100px,0.7fr)] gap-4 border-b border-pitch-700 bg-pitch-900/50 px-6 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-chalk-300 md:grid">
            <span>Collector</span>
            <span>HR code</span>
            <span>Phone</span>
            <span>Team</span>
          </div>
          <ul className="divide-y divide-pitch-800/90">
            {teammates.map((teammate) => {
              const initials = teammate.full_name
                ?.trim()
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0])
                .join("")
                .toUpperCase() || "ST";

              return (
                <li
                  key={teammate.id}
                  className="grid gap-4 px-4 py-4 transition-colors hover:bg-pitch-800/35 sm:px-6 md:grid-cols-[minmax(0,1.6fr)_minmax(110px,0.75fr)_minmax(150px,1fr)_minmax(100px,0.7fr)] md:items-center"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-clock-amber/30 bg-pitch-800 text-xs font-semibold tracking-wide text-clock-amber">
                      {initials}
                    </span>
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-chalk-50">{teammate.full_name || "Unnamed collector"}</p>
                      <p className="mt-1 text-xs text-chalk-400 md:hidden">Collector</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 md:block">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-chalk-400 md:hidden">HR code</p>
                    <p className="break-words font-mono text-sm text-chalk-200">{teammate.hr_code || "—"}</p>
                  </div>
                  <div className="flex items-center justify-between gap-3 md:block">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-chalk-400 md:hidden">Phone</p>
                    {teammate.phone ? (
                      <a className="inline-flex items-center gap-2 break-all text-sm text-chalk-100 underline decoration-pitch-600 underline-offset-4 transition hover:text-clock-amber" href={`sms:${teammate.phone.replace(/[^+\d]/g, "")}`}>
                        <span aria-hidden="true">✉</span>{teammate.phone}
                      </a>
                    ) : (
                      <p className="text-sm text-chalk-400">Not provided</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3 md:block">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-chalk-400 md:hidden">Team</p>
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

import Image from "next/image";
import { redirect } from "next/navigation";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import { chooseWorkspace } from "./actions";

export default async function SelectWorkspacePage() {
  const profile = await getProfileOrRedirect();

  if (profile.role !== "admin") {
    redirect("/collector");
  }

  return (
    <main className="relative isolate flex min-h-screen items-center overflow-hidden bg-[#021a19] px-4 py-10 sm:px-6 lg:px-10">
      <Image
        src="/images/football/stadium-tunnel-walkout.webp"
        alt=""
        fill
        priority
        sizes="100vw"
        className="-z-20 object-cover object-center"
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(110deg,rgba(2,18,17,0.92)_0%,rgba(2,25,23,0.82)_48%,rgba(2,15,15,0.72)_100%)]" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_100%,rgba(12,110,89,0.3),transparent_58%)]" />

      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 sm:mb-12">
          <div className="inline-flex items-center gap-3 rounded-full border border-white/20 bg-[#031f1d]/65 px-4 py-2.5 text-white shadow-lg backdrop-blur-md">
            <span className="grid h-10 w-10 place-items-center rounded-full border border-clock-amber/60 bg-black/20 font-display text-lg font-bold text-clock-amber">SB</span>
            <span>
              <span className="block text-sm font-semibold tracking-[0.12em]">STATBOMB</span>
              <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[0.2em] text-white/55">Matchday operations</span>
            </span>
          </div>
          <span className="rounded-full border border-white/15 bg-black/20 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.15em] text-white/65 backdrop-blur-sm">Workspace access</span>
        </header>

        <div className="grid items-stretch gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14">
          <section className="flex flex-col justify-center text-white">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-clock-amber">Your next play</p>
            <h1 className="mt-4 max-w-xl font-display text-4xl leading-[1.08] sm:text-5xl lg:text-6xl">
              Choose your
              <span className="block text-clock-amber">workspace.</span>
            </h1>
            <p className="mt-5 max-w-lg text-sm leading-6 text-white/75 sm:text-base">
              Welcome back, {profile.full_name ?? profile.email}. Choose the area you need for this session.
            </p>
            <div className="mt-8 flex flex-wrap gap-3 text-xs text-white/75">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/20 px-3 py-2 backdrop-blur-sm"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Secure access</span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/20 px-3 py-2 backdrop-blur-sm"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-clock-amber" /> One account, two workspaces</span>
            </div>
          </section>

          <section aria-label="Available workspaces" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <form action={chooseWorkspace} className="h-full">
              <input type="hidden" name="mode" value="admin" />
              <button type="submit" className="group relative flex min-h-[230px] w-full flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#031f1d]/85 p-6 text-left shadow-2xl shadow-black/20 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-clock-amber/70 hover:bg-[#032925]/95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-clock-amber sm:p-7">
                <span aria-hidden="true" className="absolute right-0 top-0 h-28 w-28 rounded-bl-full bg-clock-amber/10 transition group-hover:bg-clock-amber/20" />
                <span className="relative grid h-12 w-12 place-items-center rounded-xl border border-clock-amber/35 bg-clock-amber/10 text-clock-amber">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 19V5m16 14V5M8 8h8M8 12h8M8 16h5" strokeLinecap="round"/><path d="M2 3h20v18H2z" strokeLinejoin="round"/></svg>
                </span>
                <span className="relative mt-6 font-display text-2xl text-white">Admin</span>
                <span className="relative mt-2 text-sm leading-6 text-white/65">Manage assignments, distributions, and dashboard operations.</span>
                <span className="relative mt-auto flex items-center gap-2 pt-6 text-sm font-semibold text-clock-amber">Enter admin workspace <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span></span>
              </button>
            </form>

            <form action={chooseWorkspace} className="h-full">
              <input type="hidden" name="mode" value="collector" />
              <button type="submit" className="group relative flex min-h-[230px] w-full flex-col overflow-hidden rounded-2xl border border-emerald-300/25 bg-[#032822]/90 p-6 text-left shadow-2xl shadow-black/20 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-emerald-300/65 hover:bg-[#04352b]/95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-clock-amber sm:p-7">
                <span aria-hidden="true" className="absolute right-0 top-0 h-28 w-28 rounded-bl-full bg-emerald-400/10 transition group-hover:bg-emerald-400/20" />
                <span className="relative grid h-12 w-12 place-items-center rounded-xl border border-emerald-300/30 bg-emerald-300/10 text-emerald-200">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m12 7 3 2v4l-3 2-3-2V9l3-2Zm-3 2-3-1m9 1 3-1m-9 5-2 3m8-3 2 3M12 15v6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
                <span className="relative mt-6 font-display text-2xl text-white">Collector</span>
                <span className="relative mt-2 text-sm leading-6 text-white/65">Open your assigned matches, track your shift, and deliver match data.</span>
                <span className="relative mt-auto flex items-center gap-2 pt-6 text-sm font-semibold text-emerald-200">Enter collector workspace <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span></span>
              </button>
            </form>
          </section>
        </div>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-4 text-[10px] uppercase tracking-[0.16em] text-white/40">
          <span>Arqam Football Operations</span>
          <span>Choose the right room. Get the work done.</span>
        </footer>
      </div>
    </main>
  );
}

"use client";

import Image from "next/image";
import { useFormState, useFormStatus } from "react-dom";
import { signInWithPassword, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="group inline-flex w-full items-center justify-center gap-2 rounded-lg bg-clock-amber px-4 py-3 font-sans text-sm font-semibold text-ink shadow-lg shadow-black/15 transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clock-amber disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Signing in…" : "Sign in"}
      {!pending && <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span>}
    </button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useFormState(signInWithPassword, initialState);

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[#021a19] text-white lg:grid lg:grid-cols-2">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-20 bg-cover bg-center"
        style={{ backgroundImage: 'url("/images/football/pitch-background-dark.webp")' }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(105deg,rgba(2,20,19,0.91)_0%,rgba(2,29,27,0.86)_48%,rgba(2,19,18,0.92)_100%)]" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_15%_80%,rgba(14,110,94,0.28),transparent_45%)]" />

      <section className="relative z-10 flex min-h-screen min-w-0 flex-col justify-center px-5 py-8 sm:px-10 lg:px-10 xl:px-16 2xl:px-20">
        <div className="mx-auto w-full max-w-2xl">
          <div className="inline-flex items-center gap-3 rounded-full border border-white/20 bg-black/20 px-4 py-2 backdrop-blur-sm">
            <span className="grid h-9 w-9 place-items-center rounded-full border border-clock-amber/70 text-sm font-bold text-clock-amber">SB</span>
            <span>
              <span className="block text-sm font-semibold tracking-wide">STATBOMB</span>
              <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[0.2em] text-white/60">Collector Portal</span>
            </span>
          </div>

          <p className="mt-7 font-mono text-[10px] uppercase tracking-[0.24em] text-clock-amber sm:mt-9">
            Arqam Football Operations
          </p>
          <h1 className="mt-3 max-w-xl font-display text-4xl leading-[1.04] sm:text-5xl xl:text-6xl">
            From matches
            <span className="block text-clock-amber">to impact.</span>
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-6 text-white/80 sm:text-base">
            Your matchday starts here. Sign in to access your assignments, track your shift, and keep every detail moving.
          </p>

          <form action={formAction} className="mt-6 w-full max-w-xl rounded-2xl border border-white/15 bg-[#031f1d]/95 p-5 shadow-2xl shadow-black/35 backdrop-blur-xl sm:mt-7 sm:p-7">
            <div className="mb-5">
              <div className="mb-4 h-1 w-14 rounded-full bg-clock-amber" />
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-pitch-500">Matchday access</p>
              <h2 className="mt-2 font-display text-2xl text-white sm:text-3xl">Welcome back</h2>
              <p className="mt-2 text-sm leading-5 text-white/65">Sign in with the account your admin set up for you.</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div className="min-w-0">
                <label htmlFor="email" className="mb-1.5 block text-sm text-white/80">Email</label>
                <input id="email" name="email" type="email" autoComplete="email" required
                  className="w-full min-w-0 rounded-lg border border-white/15 bg-black/20 px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-clock-amber focus:ring-2 focus:ring-clock-amber/15"
                  placeholder="you@company.com" />
              </div>
              <div className="min-w-0">
                <label htmlFor="password" className="mb-1.5 block text-sm text-white/80">Password</label>
                <input id="password" name="password" type="password" autoComplete="current-password" required
                  className="w-full min-w-0 rounded-lg border border-white/15 bg-black/20 px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-clock-amber focus:ring-2 focus:ring-clock-amber/15"
                  placeholder="Enter your password" />
              </div>
            </div>

            {state.error ? <p role="alert" className="mt-4 rounded-lg border border-red-300/25 bg-red-950/30 px-3 py-2.5 text-sm text-red-200">{state.error}</p> : null}
            <div className="mt-5"><SubmitButton /></div>
            <p className="mt-4 text-center text-xs leading-5 text-white/45">Having trouble signing in? Contact your team manager.</p>
          </form>

          <div className="mt-6 grid max-w-xl grid-cols-3 gap-3 border-t border-white/15 pt-4 sm:mt-7 sm:pt-5">
            <div><p className="font-mono text-lg text-white">01</p><p className="mt-1 text-xs text-white/60">Review matches</p></div>
            <div><p className="font-mono text-lg text-white">02</p><p className="mt-1 text-xs text-white/60">Start your work</p></div>
            <div><p className="font-mono text-lg text-white">03</p><p className="mt-1 text-xs text-white/60">Deliver the data</p></div>
          </div>
        </div>
      </section>

      <section aria-label="Matchday stadium" className="relative hidden min-h-screen overflow-hidden border-l border-white/10 bg-[#031311] lg:block">
        <Image
          src="/images/football/login-stadium-tunnel.webp"
          alt="A dramatic stadium tunnel opening onto the football pitch"
          fill
          priority
          sizes="50vw"
          className="object-cover object-center"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#021a19]/80 via-[#021a19]/10 to-black/15" />
        <div aria-hidden="true" className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#021a19]/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-8 xl:p-12 2xl:p-16">
          <span className="inline-flex items-center gap-2 rounded-full border border-clock-amber/40 bg-black/35 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-clock-amber backdrop-blur">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-clock-amber" />
            Matchday starts here
          </span>
          <p className="mt-4 max-w-xl font-display text-3xl leading-tight text-white xl:text-4xl 2xl:text-5xl">Step into the pitch.</p>
          <p className="mt-3 max-w-md text-sm leading-6 text-white/75 xl:text-base">Your assignments. Your focus. Every detail counts.</p>
        </div>
      </section>
    </main>
  );
}

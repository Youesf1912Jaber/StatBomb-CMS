"use client";

import { useFormState, useFormStatus } from "react-dom";
import { signInWithPassword, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-card bg-clock-amber py-2.5 font-sans text-sm font-semibold text-ink transition-colors hover:bg-[#e3b45c] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useFormState(signInWithPassword, initialState);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-pitch-500">
            StatBomb
          </p>
          <h1 className="mt-2 font-display text-3xl text-chalk-50">
            Collector console
          </h1>
          <p className="mt-2 text-sm text-chalk-200">
            Sign in with the account your admin set up for you.
          </p>
        </div>

        <form action={formAction} className="space-y-4 rounded-card border border-pitch-700 bg-pitch-900 p-6">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm text-chalk-200">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-[8px] border border-pitch-700 bg-pitch-950 px-3 py-2 text-chalk-50 outline-none focus:border-clock-amber"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm text-chalk-200">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-[8px] border border-pitch-700 bg-pitch-950 px-3 py-2 text-chalk-50 outline-none focus:border-clock-amber"
            />
          </div>

          {state.error ? (
            <p role="alert" className="text-sm text-clock-red">
              {state.error}
            </p>
          ) : null}

          <SubmitButton />
        </form>
      </div>
    </main>
  );
}

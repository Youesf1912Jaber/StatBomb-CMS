"use client";

import { useTransition } from "react";
import { signOut } from "@/lib/auth/actions";

export function SignOutButton() {
  const [isPending, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(() => {
      void signOut();
    });
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={isPending}
      className="rounded-[8px] border border-pitch-700 px-3 py-1.5 text-sm text-chalk-200 transition-colors hover:border-clock-amber hover:text-chalk-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isPending ? "Signing out…" : "Sign out"}
    </button>
  );
}

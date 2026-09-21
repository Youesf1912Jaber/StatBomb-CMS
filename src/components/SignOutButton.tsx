"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className="rounded-[8px] border border-pitch-700 px-3 py-1.5 text-sm text-chalk-200 transition-colors hover:border-clock-amber hover:text-chalk-50"
    >
      Sign out
    </button>
  );
}

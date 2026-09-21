import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/types/database.types";

/**
 * Fetches the signed-in user's profile for use in Server Components.
 * Middleware already guarantees a session and the correct area for the
 * request to have reached this point, but Server Components can't rely on
 * that alone (e.g. direct RSC fetches), so this re-checks and redirects to
 * /login as a defensive fallback.
 */
export async function getProfileOrRedirect(): Promise<ProfileRow> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    redirect("/login");
  }

  return profile;
}

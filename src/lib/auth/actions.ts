"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { clearWorkspaceMode } from "./workspace-mode";

export async function signOut(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
  clearWorkspaceMode();
  redirect("/login");
}

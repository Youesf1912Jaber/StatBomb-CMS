import { redirect } from "next/navigation";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";

export const runtime = "nodejs";

export default async function LinksPage() {
  const profile = await getProfileOrRedirect();
  redirect(profile.role === "admin" ? "/admin/links" : "/collector/links");
}

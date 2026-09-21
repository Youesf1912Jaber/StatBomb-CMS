import { createClient } from "@/lib/supabase/server";
import { DistributionPreviewClient } from "./DistributionPreviewClient";

export default async function DistributionPreviewPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };
  if (profile?.role !== "admin") {
    return <p className="p-6 text-sm text-chalk-200">Admin access required.</p>;
  }
  return <DistributionPreviewClient />;
}

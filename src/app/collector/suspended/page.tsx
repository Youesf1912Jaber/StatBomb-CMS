import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";

export default async function CollectorSuspendedPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <div className="rounded-card border border-pitch-700 bg-pitch-900 p-8">
        <h1 className="font-display text-2xl text-chalk-50">Account unavailable</h1>
        <p className="mt-3 text-sm text-chalk-200">
          Your collector account is currently suspended or deactivated. Contact an
          administrator if you believe this is incorrect.
        </p>
        {user && <div className="mt-6"><SignOutButton /></div>}
      </div>
    </main>
  );
}

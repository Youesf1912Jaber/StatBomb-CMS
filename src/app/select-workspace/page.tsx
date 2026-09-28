import { redirect } from "next/navigation";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import { chooseWorkspace } from "./actions";

export default async function SelectWorkspacePage() {
  const profile = await getProfileOrRedirect();

  if (profile.role !== "admin") {
    redirect("/collector");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <div className="mb-10 text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-pitch-500">
            StatBomb
          </p>
          <h1 className="mt-2 font-display text-3xl text-chalk-50">
            Choose your workspace
          </h1>
          <p className="mt-2 text-sm text-chalk-200">
            Signed in as {profile.full_name ?? profile.email}. This only
            changes which interface you enter.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <form action={chooseWorkspace}>
            <input type="hidden" name="mode" value="admin" />
            <button
              type="submit"
              className="flex h-full w-full flex-col rounded-card border border-pitch-700 bg-pitch-900 px-5 py-6 text-left transition-colors hover:border-clock-amber"
            >
              <span className="font-display text-xl text-chalk-50">Admin</span>
              <span className="mt-2 text-sm text-chalk-200">
                Manage assignments, distributions, and dashboard
              </span>
            </button>
          </form>

          <form action={chooseWorkspace}>
            <input type="hidden" name="mode" value="collector" />
            <button
              type="submit"
              className="flex h-full w-full flex-col rounded-card border border-pitch-700 bg-pitch-900 px-5 py-6 text-left transition-colors hover:border-clock-amber"
            >
              <span className="font-display text-xl text-chalk-50">Collector</span>
              <span className="mt-2 text-sm text-chalk-200">
                Work on assigned matches
              </span>
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

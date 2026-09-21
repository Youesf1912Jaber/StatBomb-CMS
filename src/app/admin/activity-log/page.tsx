import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfileOrRedirect } from "@/lib/auth/getProfile";
import {
  getActivityLogActionOptions,
  getActivityLogsPage,
  type ActivityLogDisplayItem,
} from "@/lib/activity-logs/queries";

const PAGE_SIZE = 25;

type SearchParams = Record<string, string | string[] | undefined>;

function getParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function buildPageHref(params: SearchParams, nextPage: number): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      if (value) searchParams.set(key, value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (item) searchParams.append(key, item);
      }
    }
  }

  if (nextPage > 1) {
    searchParams.set("page", String(nextPage));
  } else {
    searchParams.delete("page");
  }

  const query = searchParams.toString();
  return query ? `/admin/activity-log?${query}` : "/admin/activity-log";
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function renderSummary(item: ActivityLogDisplayItem): string {
  if (item.changeSummary) return item.changeSummary;
  return item.actionLabel;
}

export default async function AdminActivityLogPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const profile = await getProfileOrRedirect();
  if (profile.role !== "admin") {
    redirect("/collector");
  }

  const supabase = createClient();
  const search = getParam(searchParams?.search);
  const action = getParam(searchParams?.action);
  const dateFrom = getParam(searchParams?.from);
  const dateTo = getParam(searchParams?.to);
  const page = Math.max(1, Number(getParam(searchParams?.page) || "1"));

  let items: ActivityLogDisplayItem[] = [];
  let totalCount = 0;
  let totalPages = 1;
  let errorMessage: string | null = null;

  try {
    const result = await getActivityLogsPage(supabase, {
      search,
      action: action === "all" ? "" : action,
      dateFrom,
      dateTo,
      page,
      pageSize: PAGE_SIZE,
    });
    items = result.items;
    totalCount = result.totalCount;
    totalPages = result.totalPages;
  } catch {
    errorMessage = "Activity logs could not be loaded right now. Please try again shortly.";
  }

  const availableActions = await getActivityLogActionOptions(supabase).catch(() => []);

  const startIndex = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endIndex = Math.min(page * PAGE_SIZE, totalCount);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-chalk-50">Activity Log</h1>
        <p className="mt-1 text-sm text-chalk-200">
          Audit trail for assignment changes and admin actions.
        </p>
      </div>

      <form method="GET" className="rounded-card border border-pitch-700 bg-pitch-900 p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <label className="flex flex-col gap-1 text-sm text-chalk-200">
            Search
            <input
              name="search"
              defaultValue={search}
              placeholder="Name, action, match"
              className="rounded border border-pitch-700 bg-pitch-950 px-3 py-2 text-sm text-chalk-50 outline-none ring-0 placeholder:text-chalk-400"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-chalk-200">
            Action
            <select
              name="action"
              defaultValue={action || "all"}
              className="rounded border border-pitch-700 bg-pitch-950 px-3 py-2 text-sm text-chalk-50 outline-none"
            >
              <option value="all">All actions</option>
              {availableActions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm text-chalk-200">
            From
            <input
              type="date"
              name="from"
              defaultValue={dateFrom}
              className="rounded border border-pitch-700 bg-pitch-950 px-3 py-2 text-sm text-chalk-50 outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-chalk-200">
            To
            <input
              type="date"
              name="to"
              defaultValue={dateTo}
              className="rounded border border-pitch-700 bg-pitch-950 px-3 py-2 text-sm text-chalk-50 outline-none"
            />
          </label>

          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="flex-1 rounded border border-clock-amber bg-clock-amber px-3 py-2 text-sm font-medium text-pitch-950 transition-colors hover:bg-clock-amber/90"
            >
              Apply
            </button>
            <Link
              href="/admin/activity-log"
              className="flex-1 rounded border border-pitch-700 px-3 py-2 text-center text-sm text-chalk-200 transition-colors hover:border-pitch-500 hover:text-chalk-50"
            >
              Reset
            </Link>
          </div>
        </div>
      </form>

      {errorMessage ? (
        <div className="rounded-card border border-pitch-700 bg-pitch-900 px-4 py-6 text-sm text-chalk-200">
          {errorMessage}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-card border border-dashed border-pitch-700 bg-pitch-900 px-4 py-8 text-center text-sm text-chalk-200">
          No activity logs found.
        </div>
      ) : (
        <>
          <div className="text-sm text-chalk-200">
            Showing {startIndex}-{endIndex} of {totalCount}
          </div>

          <div className="overflow-x-auto rounded-card border border-pitch-700 bg-pitch-900">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-pitch-700 bg-pitch-900">
                <tr>
                  <th className="px-4 py-3 font-medium text-chalk-200">Date</th>
                  <th className="px-4 py-3 font-medium text-chalk-200">User</th>
                  <th className="px-4 py-3 font-medium text-chalk-200">Action</th>
                  <th className="px-4 py-3 font-medium text-chalk-200">Assignment</th>
                  <th className="px-4 py-3 font-medium text-chalk-200">Match</th>
                  <th className="px-4 py-3 font-medium text-chalk-200">Changes</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-pitch-800 align-top">
                    <td className="px-4 py-3 text-chalk-200">{formatDateTime(item.created_at)}</td>
                    <td className="px-4 py-3 text-chalk-50">{item.userName}</td>
                    <td className="px-4 py-3 text-chalk-50">{item.actionLabel}</td>
                    <td className="px-4 py-3 text-chalk-50">
                      {item.assignmentId ? (
                        <Link
                          href={`/admin/assignments/${item.assignmentId}`}
                          className="text-clock-amber hover:underline"
                        >
                          {item.assignmentTask ?? item.assignmentId}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-chalk-200">{item.matchLabel ?? "—"}</td>
                    <td className="max-w-xl px-4 py-3 text-chalk-50">{renderSummary(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {totalPages > 1 && !errorMessage && (
        <div className="flex items-center justify-between gap-3">
          <Link
            href={page <= 1 ? "/admin/activity-log" : buildPageHref({ search, action, from: dateFrom, to: dateTo }, page - 1)}
            className={page <= 1 ? "pointer-events-none text-chalk-500" : "text-clock-amber hover:underline"}
          >
            Previous
          </Link>
          <div className="text-sm text-chalk-200">
            Page {page} / {totalPages}
          </div>
          <Link
            href={buildPageHref({ search, action, from: dateFrom, to: dateTo }, page + 1)}
            className={page >= totalPages ? "pointer-events-none text-chalk-500" : "text-clock-amber hover:underline"}
          >
            Next
          </Link>
        </div>
      )}
    </div>
  );
}

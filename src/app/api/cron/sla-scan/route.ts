import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { dispatchPendingPushNotifications } from "@/lib/push/sender";

/**
 * SLA scanner. Invoked by Vercel Cron (see vercel.json) roughly every 60
 * seconds; not a client-callable RPC.
 *
 * All the actual state logic lives in the `evaluate_assignment_sla_states()`
 * database function (migration 0004): fire the 30-minute SLA warning once,
 * flip past-SLA incomplete assignments to 'Overdue' once. That function is
 * state-based and guarded by `sla_warning_sent_at` / `overdue_notified_at`,
 * so this route is safe to call at any frequency, twice concurrently, or
 * after arbitrary downtime — a missed tick is simply caught by the next run
 * and each event still fires exactly once. This handler therefore stays a
 * thin, auth-checked trigger with no SLA logic of its own to drift.
 */

// Never prerender or cache: this must execute on every invocation.
export const dynamic = "force-dynamic";
// node:crypto + the service-role client require the Node runtime.
export const runtime = "nodejs";

/** Constant-time secret comparison — avoids leaking the secret via timing. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, so compare lengths first.
  // Length is not sensitive here; the secret's contents are.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Accepts the secret either as `Authorization: Bearer <secret>` (what Vercel
 * Cron sends automatically when CRON_SECRET is set) or as an explicit
 * `x-cron-secret` header (for manual/other schedulers).
 */
function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;

  // Fail closed: an unset/empty secret must never mean "open endpoint".
  if (!expected) return false;

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    if (secretMatches(authHeader.slice("Bearer ".length), expected)) return true;
  }

  const headerSecret = request.headers.get("x-cron-secret");
  if (headerSecret && secretMatches(headerSecret, expected)) return true;

  return false;
}

async function runScan(request: NextRequest) {
  if (!isAuthorized(request)) {
    // Deliberately terse: no hint about whether CRON_SECRET is configured.
    console.warn("[sla-scan] rejected unauthorized request");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc("evaluate_assignment_sla_states");

    if (error) {
      // Log server-side detail; return nothing internal to the caller.
      console.error("[sla-scan] rpc failed", {
        message: error.message,
        code: error.code,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "sla_scan_failed" }, { status: 500 });
    }

    // The function returns a single row of counters.
    const result = data?.[0] ?? { warnings_fired: 0, overdue_fired: 0 };

    // Fan the rows the RPC just inserted out to Browser Push. Deliberately
    // non-fatal: the in-app notifications are already committed, so a push
    // problem must not turn a successful scan into a 500 (and any rows left
    // unstamped are simply retried next tick).
    let push = null;
    try {
      push = await dispatchPendingPushNotifications(supabase);
    } catch (cause) {
      console.error("[sla-scan] push fan-out failed", {
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }

    const durationMs = Date.now() - startedAt;

    console.info("[sla-scan] completed", {
      warningsFired: result.warnings_fired,
      overdueFired: result.overdue_fired,
      pushesSent: push?.pushesSent ?? 0,
      pushSubscriptionsRemoved: push?.subscriptionsRemoved ?? 0,
      pushFailures: push?.failures ?? 0,
      pushSkipped: push?.skipped ?? true,
      durationMs,
    });

    return NextResponse.json({
      ok: true,
      warningsFired: result.warnings_fired,
      overdueFired: result.overdue_fired,
      pushesSent: push?.pushesSent ?? 0,
      durationMs,
    });
  } catch (cause) {
    // Covers a missing SUPABASE_SERVICE_ROLE_KEY, network failure, etc. A
    // failed run loses no state — the next tick re-evaluates from scratch.
    console.error("[sla-scan] unexpected failure", {
      message: cause instanceof Error ? cause.message : String(cause),
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: "sla_scan_failed" }, { status: 500 });
  }
}

// Vercel Cron issues GET requests; POST is kept for manual/other triggers.
export async function GET(request: NextRequest) {
  return runScan(request);
}

export async function POST(request: NextRequest) {
  return runScan(request);
}

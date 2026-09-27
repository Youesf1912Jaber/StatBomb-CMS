import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Manages the caller's own push subscription.
 *
 * Uses the ordinary anon-key server client, so RLS (`push_subs_owner`:
 * `profile_id = auth.uid()` for both USING and WITH CHECK) is what enforces
 * ownership — a caller cannot register or delete a subscription for anyone
 * else even by forging the body. The service-role key is never used here.
 */

export const dynamic = "force-dynamic";

interface SubscribeBody {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
  installationId?: unknown;
  previousEndpoint?: unknown;
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: SubscribeBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const endpoint = body.endpoint;
  const p256dh = body.keys?.p256dh;
  const authKey = body.keys?.auth;
  const previousEndpoint = body.previousEndpoint;

  if (
    typeof endpoint !== "string" ||
    typeof p256dh !== "string" ||
    typeof authKey !== "string" ||
    endpoint.length === 0
  ) {
    return NextResponse.json({ error: "invalid_subscription" }, { status: 400 });
  }

  // Re-subscribing the same browser must refresh the keys, not pile up rows —
  // hence upsert on the (profile_id, endpoint) unique constraint.
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      profile_id: user.id,
      endpoint,
      p256dh,
      auth_key: authKey,
    },
    { onConflict: "profile_id,endpoint" }
  );

  if (error) {
    console.error("[push/subscribe] upsert failed", { message: error.message });
    return NextResponse.json({ error: "subscribe_failed" }, { status: 500 });
  }

  if (typeof previousEndpoint === "string" && previousEndpoint !== endpoint) {
    const { error: deleteError } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("profile_id", user.id)
      .eq("endpoint", previousEndpoint);

    if (deleteError) {
      console.error("[push/subscribe] previous endpoint delete failed", {
        message: deleteError.message,
      });
      return NextResponse.json({ error: "subscribe_failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let endpoint: unknown = null;
  try {
    const body = (await request.json()) as SubscribeBody;
    endpoint = body.endpoint;
  } catch {
    // No body: fall through and remove all of this user's subscriptions.
  }

  let query = supabase.from("push_subscriptions").delete().eq("profile_id", user.id);
  if (typeof endpoint === "string" && endpoint.length > 0) {
    query = query.eq("endpoint", endpoint);
  }

  const { error } = await query;

  if (error) {
    console.error("[push/subscribe] delete failed", { message: error.message });
    return NextResponse.json({ error: "unsubscribe_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

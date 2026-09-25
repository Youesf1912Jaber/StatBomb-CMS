import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database, UserRole } from "@/types/database.types";

const PUBLIC_PATHS = ["/login", "/auth/callback"];

function roleHome(role: UserRole): string {
  return role === "admin" ? "/admin" : "/collector";
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request: { headers: request.headers } });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Required so an expiring session gets refreshed on every navigation.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user) {
    if (isPublicPath || pathname === "/") {
      return response;
    }
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Signed in: fetch role to enforce the admin/collector area split and to
  // bounce signed-in users away from /login.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, deleted_at, suspended_at")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const role: UserRole = profile.role;
  const home = roleHome(role);

  if (isPublicPath || pathname === "/") {
    return NextResponse.redirect(new URL(home, request.url));
  }

  if (pathname.startsWith("/admin") && role !== "admin") {
    return NextResponse.redirect(new URL(home, request.url));
  }

  if (pathname.startsWith("/collector") && role !== "collector") {
    return NextResponse.redirect(new URL(home, request.url));
  }

  if (
    role === "collector" &&
    (profile?.deleted_at || profile?.suspended_at) &&
    pathname !== "/collector/suspended"
  ) {
    return NextResponse.redirect(new URL("/collector/suspended", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets, Next internals, and the cron
     * API. `api/cron/*` is excluded because those are machine endpoints
     * called with no auth cookie (Vercel Cron) — session middleware would
     * redirect them to /login before the handler runs. They authenticate
     * themselves with CRON_SECRET instead.
      * `sw.js` is excluded so the browser can fetch the service worker as
      * JavaScript without a session cookie. Auth middleware would otherwise
      * redirect unauthenticated SW updates to /login HTML, which breaks push.
      */
      "/((?!api/cron|_next/static|_next/image|favicon.ico|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)",
    ],
  };

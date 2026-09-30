# StatBomb Collector Management System


Operations console for StatBomb match-data collectors: assignments, SLA
tracking, and reporting. Built against `03-final-specification-v2.md`.

This repo is being built phase by phase. **This is Phase 1**: project setup,
Supabase auth/roles, protected routes, AppShell, and empty dashboards. No
matches, assignments, notifications, or sync pipeline yet — those are later
phases.

## Stack

- Next.js 14 (App Router) + TypeScript, strict mode
- Supabase (Postgres, Auth, RLS) via `@supabase/ssr` + `@supabase/supabase-js`
- Tailwind CSS

## 1. Supabase project setup

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL Editor, run the migration in order:
   - `supabase/migrations/0001_phase1_auth_and_profiles.sql`

   (Or, if you use the Supabase CLI: `supabase db push` with this repo's
   `supabase/migrations` folder linked to your project.)
3. In **Authentication → Providers**, confirm Email is enabled.
4. In **Authentication → URL Configuration**, add your local and deployed
   origins (e.g. `http://localhost:3000`, `https://your-app.vercel.app`) to
   the redirect allow-list — needed for the `/auth/callback` route to work
   with invite/reset-password emails later.
5. Create your first account: sign up once through the app's `/login` flow
   is not available yet on its own (there's no self-serve sign-up page by
   design — collector accounts are meant to be provisioned by an admin in a
   later phase). For now, create the first user directly in **Authentication
   → Users → Add user** in the Supabase dashboard, or via
   `supabase.auth.admin.createUser(...)` with the service-role key. The
   `handle_new_user` trigger auto-creates their `profiles` row with
   `role = 'collector'`.
6. Promote that first user to admin by running this once in the SQL editor
   (replace the email):

   ```sql
   update profiles set role = 'admin' where email = 'you@example.com';
   ```

## 2. Environment variables

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=          # Project Settings → API → Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # Project Settings → API → anon public key
```

`SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` are now **required in any
environment where the SLA scanner runs** — `/api/cron/sla-scan` rejects every
request when `CRON_SECRET` is unset. On Vercel, set both as project
environment variables; Vercel Cron automatically sends `CRON_SECRET` as an
`Authorization: Bearer …` header on each invocation.

**Never** put the service-role key behind a `NEXT_PUBLIC_` prefix or import
`createServiceRoleClient()` (in `src/lib/supabase/server.ts`) from any file
that a Client Component could pull into its bundle. That module is marked
`server-only`, so such an import fails the build rather than leaking the key.

## 3. Local run

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`. Signed-out visitors see a landing page and can
sign in at `/login`. Signed-in users are routed to `/admin` or `/collector`
based on their `profiles.role`.

Other commands:

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm run build        # production build
npm run start         # serve the production build (after build)
```

## 4. SLA alerts

Authenticated admin and collector shells render SLA warnings in-app; no
browser push, Service Worker, or notification permission is used. The shared
global alert component evaluates role-visible assignments locally, shows a
warning during the one-hour window preceding the SLA deadline, and refreshes
on assignment realtime updates and once per minute. Each alert can be
independently silenced for its assignment/SLA event without changing the
assignment. Audio is enabled from the alert when browser autoplay protection
requires a user interaction; multiple tabs use a short local-storage lease so
only one tab plays alarms.

## 5. What's implemented in Phase 1

- `user_role` enum (`admin` | `collector`) and a `profiles` table, 1:1 with
  `auth.users`, auto-provisioned on signup via a trigger (defaults to
  `collector`).
- RLS on `profiles`: a user can read/update their own row; admins can
  read/update any row (via the `is_admin()` security-definer helper, which
  avoids RLS self-recursion and is reused by later phases for admin-only
  checks). A trigger blocks a non-admin from changing their own `role`.
- Email/password auth via Supabase Auth. No self-serve sign-up page — see
  "Supabase project setup" above for provisioning the first account.
- `middleware.ts` refreshes the session on every request, redirects signed
  -out users to `/login`, and redirects signed-in users to `/admin` or
  `/collector` based on role — including bouncing an admin out of
  `/collector` and vice versa.
- Server Component layouts (`/admin/layout.tsx`, `/collector/layout.tsx`)
  re-check the role server-side as defense in depth beyond middleware.
- `AppShell`: responsive chrome (sidebar on desktop, top bar on mobile) with
  nav, the signed-in user's name/role, and sign-out.
- Empty Admin and Collector dashboard pages — placeholders only, per the
  final spec's phase ordering.

## 6. Known limitations (expected at this phase)

- No matches, assignments, SLA tracking, notifications, reassignment, or
  sync pipeline yet — those are Phases 2–6.
- No admin UI for creating/managing collector accounts yet (Phase 4/5
  territory); the first admin is promoted via one manual SQL statement
  (above).
- No automated test suite yet — Phase 1 was verified manually (see the
  end-of-phase report for exactly what was run).
- `database.types.ts` is hand-written for this one-table schema. Once later
  phases add real tables, regenerate it with the Supabase CLI instead of
  continuing to hand-edit it (command is in a comment at the top of the
  file).

## 7. Deployment preparation

This is a standard Next.js App Router project — deployable to Vercel (or any
Node host that supports Next 14 middleware) with no special build steps
beyond `npm run build`. Before deploying:

1. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the
   host's environment variable settings (not committed to the repo).
2. Add the deployed origin to Supabase's Auth redirect allow-list (see step 4
   above).
3. Run the Phase 1 migration against the target Supabase project before the
   first deploy touches it.

`SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` are needed only when the SLA
scanner endpoint is deployed.

Supabase GitHub deployment integration enabled.

Vercel Hobby production deployments must be authored by the GitHub repository owner.

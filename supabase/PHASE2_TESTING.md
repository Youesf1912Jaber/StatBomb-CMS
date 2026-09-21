# Phase 2 manual verification checklist

These four tests genuinely exercise `auth.uid()`-based RLS and the RPCs
under real authenticated sessions. They can't be run inside this sandboxed
build environment (no live Supabase project, no network egress to
Postgres/Supabase, and no package access to stand up a local Postgres to
simulate one) — run them once against your Supabase project, either via
`psql`/the SQL editor for the seed steps, or via the running app for the
auth-dependent steps.

## Setup

1. Run `0001_phase1_auth_and_profiles.sql` then `0002_phase2_matches_and_assignments.sql`.
2. Create three users (Auth → Users, or the app's provisioning flow): one
   admin (promote via `update profiles set role='admin' where email=...`)
   and two collectors, `collector-a@example.com` / `collector-b@example.com`.
3. Seed one match and two assignments, one per collector, as the admin
   (via the SQL editor, which runs with elevated privileges so RLS doesn't
   block the seed):

   ```sql
   insert into matches (external_id, home_team, away_team, match_date, official_website_url)
   values ('TEST-001', 'Walton & Hersham', 'Ebbsfleet United', current_date, 'https://example.com')
   returning id; -- note this as :match_id

   insert into assignments (match_id, collector_id, raw_task_value, task, half, sla, shift_date, status)
   values (
     '<match_id>',
     (select id from profiles where email = 'collector-a@example.com'),
     'Base all', 'Base all', 'Half 1', now() + interval '1 hour', current_date, 'Not Started'
   ) returning id; -- note as :assignment_a

   insert into assignments (match_id, collector_id, raw_task_value, task, half, sla, shift_date, status)
   values (
     '<match_id>',
     (select id from profiles where email = 'collector-b@example.com'),
     'Extras', 'Extras', 'Half 1', now() + interval '1 hour', current_date, 'Not Started'
   );
   ```

## Test 1 — Start Work / Complete Work state transitions

Sign in to the app as `collector-a`, open `:assignment_a`'s details page.

- [ ] "Start Work" is shown (status = Not Started). Click it → status flips
      to "In Progress", `started_at` is now populated, "Complete Work" is
      now shown.
- [ ] Click "Start Work" again via a second tab/duplicate request (or call
      `select start_assignment(':assignment_a')` directly in SQL as that
      collector's role) → fails with `ASSIGNMENT_NOT_STARTABLE`, no second
      state change.
- [ ] Click "Complete Work" → status flips to "Completed", `completed_at`
      populated, button disappears.
- [ ] Click "Complete Work" again (or re-call the RPC) → fails with
      `ASSIGNMENT_NOT_COMPLETABLE`.

## Test 2 — RLS isolation between collector accounts

While signed in as `collector-a`:

- [ ] Navigate to `/collector/assignments/:assignment_b` (collector-b's
      assignment id) directly by URL → 404 (not "forbidden" — RLS makes the
      row invisible, not merely unwritable, so the app correctly can't
      distinguish "doesn't exist" from "isn't mine").
- [ ] The collector dashboard's "All Assignments" table shows only
      collector-a's own assignment, never collector-b's.
- [ ] On `:assignment_a`'s details page, "Other collectors on this match"
      correctly lists collector-b (same match, different assignment) — this
      confirms `get_match_collaborators` grants narrow, match-scoped
      visibility without loosening `profiles` or `assignments` RLS broadly.

Sign in as the admin:

- [ ] Both assignments are visible in `/admin`'s table, with correct
      collector names resolved.

## Test 3 — Duplicate logical assignment protection

As the admin (via SQL editor, calling the RPC directly, or once an admin
UI exists for it):

```sql
select create_assignment(
  '<match_id>', (select id from profiles where email='collector-a@example.com'),
  'Base all', 'Base all', 'Half 1', now() + interval '1 hour', current_date
);
```

- [ ] Fails with an error whose message is exactly `DUPLICATE_LOGICAL_ASSIGNMENT`
      and whose `DETAIL` is `:assignment_a`'s id — not a raw
      `duplicate key value violates unique constraint "assignments_logical_identity"`.
- [ ] Same result calling `update_assignment_task_half(':assignment_b', 'Base all', 'Half 1', 'Extras')`
      (editing collector-b's assignment to collide with collector-a's).
- [ ] A non-admin (collector) calling either RPC gets `not authorized`, not
      a duplicate error and not a silent success.

## Test 4 — SLA countdown across page refresh

- [ ] Open an assignment details page; note the countdown value.
- [ ] Wait ~10 seconds, hard-refresh the page (not just client navigation).
- [ ] The countdown resumes at the correct (lower) remaining time — proof
      it's being recomputed from the stored `sla` timestamp on each load,
      not resumed from a client-side duration that would reset to the full
      value on refresh.
- [ ] Set an assignment's `sla` to a past timestamp directly in SQL and
      reload — the countdown renders as overdue (red, `-mm:ss`), confirming
      the same component handles the overdue case without needing the
      Phase 3 scanner.

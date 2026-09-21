-- Phase 3 (Browser Push), step 4.
--
-- Adds the push-subscription store from the final spec §2 plus one
-- idempotency guard on `notifications` so the push fan-out inherits the same
-- "exactly once, downtime-safe" property the SLA scanner already has.
--
-- Explicitly NOT here: any change to evaluate_assignment_sla_states() (0004)
-- or to the in-app notification path. Push is an additional sender layered on
-- top of the existing `notifications` rows, per spec §2 / §8.6.

-- ---------------------------------------------------------------------
-- 1. push_subscriptions
-- ---------------------------------------------------------------------
-- Column names follow the final spec §2 verbatim. `auth_key` (not `auth`)
-- because `auth` collides with Supabase's `auth` schema name in unqualified
-- contexts and the spec already anticipated that.
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now(),
  -- One row per (user, browser endpoint): re-subscribing the same browser
  -- upserts instead of accumulating duplicates.
  unique (profile_id, endpoint)
);

create index push_subscriptions_profile_id_idx on push_subscriptions (profile_id);

alter table push_subscriptions enable row level security;

-- Owner-only, exactly as specified in §2: a user may read/insert/update/delete
-- only their own subscriptions, and cannot forge a row for someone else.
-- The service-role scanner bypasses RLS, which is how it reads every
-- recipient's endpoints and prunes expired ones.
create policy push_subs_owner on push_subscriptions
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------
-- 2. notifications.pushed_at — push fan-out idempotency guard
-- ---------------------------------------------------------------------
-- Mirrors the sla_warning_sent_at / overdue_notified_at pattern from 0004.
-- The SLA scanner inserts notification rows inside Postgres, which cannot
-- itself speak the Web Push protocol; the cron route therefore picks up rows
-- where `pushed_at is null` immediately afterwards and marks them once
-- delivery has been attempted. If a run dies mid-way, the next run retries
-- only the rows that were never marked — no duplicate pushes, no lost ones.
alter table notifications add column pushed_at timestamptz;

-- Partial index: the scanner's hot path is "unpushed rows only", which is
-- normally empty or tiny, so this stays cheap regardless of table size.
create index notifications_unpushed_idx on notifications (sent_at)
  where pushed_at is null;

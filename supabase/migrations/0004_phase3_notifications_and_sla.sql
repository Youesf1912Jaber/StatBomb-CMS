-- Phase 3 (SLA foundation), part 2 of 2.
--
-- Adds the notification plumbing and the global SLA scanner function that the
-- Phase 2 migration explicitly deferred (see its header). Scope of THIS step:
--   - notification_type enum + notifications table (+ RLS + index)
--   - assignments.sla_warning_sent_at / overdue_notified_at idempotency guards
--   - evaluate_assignment_sla_states(): service-role-only scanner function
--
-- Intentionally NOT here (later Phase 3+ steps): in-app notification UI,
-- browser push / VAPID / service worker / push_subscriptions, cron route,
-- reassignment, leaves, deductions, sync. This is the DB foundation only.
--
-- The 'Overdue' enum value itself was added in 0003 (separate transaction).

-- ---------------------------------------------------------------------
-- 1. notification_type enum
-- ---------------------------------------------------------------------
-- Full set from the final spec (§2 / v1 §D) so later phases (reassignment,
-- start/complete events) never need an ALTER TYPE ... ADD VALUE of their own.
create type notification_type as enum (
  'assignment_created',
  'assignment_reassigned',
  'assignment_started',
  'sla_warning',
  'assignment_overdue',
  'assignment_completed'
);

-- ---------------------------------------------------------------------
-- 2. notifications
-- ---------------------------------------------------------------------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles (id) on delete cascade,
  -- Nullable: a notification is not always tied to one assignment, but the
  -- SLA events this phase emits always are.
  assignment_id uuid references assignments (id) on delete cascade,
  type notification_type not null,
  title text not null,
  message text not null,
  sent_at timestamptz not null default now(),
  read_at timestamptz
);

-- Spec index (§D): recipient's unread-first / newest-first listing.
create index notifications_recipient_read_idx on notifications (recipient_id, read_at);
create index notifications_assignment_id_idx on notifications (assignment_id);

alter table notifications enable row level security;

-- Recipient reads their own; admins read all. Matches v1 §G.
create policy notifications_owner_read on notifications
  for select
  using (recipient_id = auth.uid() or is_admin());

-- Only the recipient may mark their own notifications read (update read_at).
create policy notifications_owner_update on notifications
  for update
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- No insert/delete policy for `authenticated`: notification rows are written
-- only by the service-role SLA scanner below and (in later phases) by
-- security-definer RPCs / the service-role sync pipeline. This mirrors the
-- matches/assignments write pattern from Phase 2.

-- ---------------------------------------------------------------------
-- 3. assignments SLA idempotency guards
-- ---------------------------------------------------------------------
-- sla_warning_sent_at: set once when the 30-minute warning fires.
-- overdue_notified_at: set once when the assignment flips to 'Overdue'.
-- Both are pure idempotency guards for evaluate_assignment_sla_states(); they
-- are what make the scanner safe to run every 60s and safe across downtime
-- (a missed tick is caught by the next run's WHERE clause, and never re-fires).
alter table assignments add column sla_warning_sent_at timestamptz;
alter table assignments add column overdue_notified_at timestamptz;

-- ---------------------------------------------------------------------
-- 4. evaluate_assignment_sla_states() — global SLA scanner
--
-- Implements the final spec's SLA architecture (v1 §H, reaffirmed by v2 §8.6):
--   1. Fire the 30-minute SLA warning exactly once per assignment.
--   2. Flip past-SLA, not-completed assignments to 'Overdue' exactly once.
--
-- State-based and idempotent (guarded by the `... is null` columns + status),
-- NOT event/timer based — so it is downtime-safe: any assignment that *should*
-- already have warned / flipped is caught by the next run and fired once.
-- Completed assignments never re-enter either query.
--
-- SECURITY / ACCESS MODEL: this must update rows across ALL collectors and
-- insert notifications for ALL admins, which is intentionally broader than any
-- single user's RLS. It is therefore `security definer` and granted ONLY to
-- service_role — never to anon/authenticated. It is meant to be invoked
-- server-side (service-role key) by the cron route added in a later step; it is
-- not a client-callable RPC. There is no auth.uid() check because the service
-- role has no end-user JWT — the GRANT is the access control.
-- ---------------------------------------------------------------------
create or replace function evaluate_assignment_sla_states()
returns table (warnings_fired bigint, overdue_fired bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_warn record;
  v_over record;
  v_admin record;
  v_warnings bigint := 0;
  v_overdue bigint := 0;
begin
  -- (1) 30-minute SLA warnings, exactly once each.
  --     Uses the existing partial index assignments_sla_idx
  --     (sla) WHERE status <> 'Completed'.
  for v_warn in
    update assignments
    set sla_warning_sent_at = now()
    where status <> 'Completed'
      and sla_warning_sent_at is null
      and now() >= sla - interval '30 minutes'
    returning id, collector_id, sla
  loop
    insert into notifications (recipient_id, assignment_id, type, title, message)
    values (
      v_warn.collector_id, v_warn.id, 'sla_warning',
      'SLA warning',
      'An assignment is due within 30 minutes (SLA ' || v_warn.sla || ').'
    );

    for v_admin in select id from profiles where role = 'admin' loop
      insert into notifications (recipient_id, assignment_id, type, title, message)
      values (
        v_admin.id, v_warn.id, 'sla_warning',
        'SLA warning',
        'An assignment is due within 30 minutes (SLA ' || v_warn.sla || ').'
      );
    end loop;

    v_warnings := v_warnings + 1;
  end loop;

  -- (2) Flip to 'Overdue', exactly once each. Runs after (1) so an assignment
  --     that blew straight past its SLA during downtime still records both its
  --     (late) warning and its overdue transition, each only once.
  for v_over in
    update assignments
    set status = 'Overdue',
        overdue_notified_at = now()
    where status not in ('Completed', 'Overdue')
      and overdue_notified_at is null
      and now() > sla
    returning id, collector_id, sla
  loop
    insert into notifications (recipient_id, assignment_id, type, title, message)
    values (
      v_over.collector_id, v_over.id, 'assignment_overdue',
      'Assignment overdue',
      'An assignment is past its SLA (' || v_over.sla || ') and not completed.'
    );

    for v_admin in select id from profiles where role = 'admin' loop
      insert into notifications (recipient_id, assignment_id, type, title, message)
      values (
        v_admin.id, v_over.id, 'assignment_overdue',
        'Assignment overdue',
        'An assignment is past its SLA (' || v_over.sla || ') and not completed.'
      );
    end loop;

    v_overdue := v_overdue + 1;
  end loop;

  return query select v_warnings, v_overdue;
end;
$$;

-- Default-deny, then allow ONLY the service role. Never anon / authenticated.
revoke all on function evaluate_assignment_sla_states() from public;
revoke all on function evaluate_assignment_sla_states() from anon;
revoke all on function evaluate_assignment_sla_states() from authenticated;
grant execute on function evaluate_assignment_sla_states() to service_role;

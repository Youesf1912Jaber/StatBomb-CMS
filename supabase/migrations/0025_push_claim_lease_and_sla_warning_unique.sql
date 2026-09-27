-- Task 9B: atomic push claim/lease + one sla_warning row per assignment/recipient.
--
-- Does not change evaluate_assignment_sla_states(), sla_warning_sent_at,
-- overdue logic, RLS, or the notification UI.
--
-- 1. push_claimed_at is a short-lived send lease so concurrent cron runs cannot
--    both send the same unpushed notification.
-- 2. claim_pending_push_notifications() atomically claims eligible rows
--    (FOR UPDATE SKIP LOCKED). A crashed claim expires and can be reclaimed.
-- 3. Unique (assignment_id, recipient_id) for type = 'sla_warning' is created
--    only when no duplicate groups exist. Existing notification history is
--    never deleted.

alter table notifications add column if not exists push_claimed_at timestamptz;

create or replace function claim_pending_push_notifications(
  p_limit integer default 200,
  p_lease_seconds integer default 120
)
returns setof notifications
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_limit is null or p_limit < 1 then
    p_limit := 200;
  end if;
  if p_lease_seconds is null or p_lease_seconds < 1 then
    p_lease_seconds := 120;
  end if;

  return query
  with pending as (
    select id
    from notifications
    where pushed_at is null
      and (
        push_claimed_at is null
        or push_claimed_at < now() - (interval '1 second' * p_lease_seconds)
      )
    order by sent_at asc
    limit p_limit
    for update skip locked
  )
  update notifications as n
  set push_claimed_at = now()
  from pending
  where n.id = pending.id
    and n.pushed_at is null
  returning n.*;
end;
$$;

revoke all on function claim_pending_push_notifications(integer, integer) from public;
revoke all on function claim_pending_push_notifications(integer, integer) from anon;
revoke all on function claim_pending_push_notifications(integer, integer) from authenticated;
grant execute on function claim_pending_push_notifications(integer, integer) to service_role;

do $$
declare
  v_dupes integer;
begin
  select count(*)::integer
  into v_dupes
  from (
    select 1
    from notifications
    where type = 'sla_warning'
    group by assignment_id, recipient_id
    having count(*) > 1
  ) as duplicate_groups;

  if v_dupes > 0 then
    raise notice 'Skipping notifications_sla_warning_assignment_recipient_uidx: % duplicate sla_warning (assignment_id, recipient_id) groups exist. Notification history was not deleted.', v_dupes;
  else
    execute $idx$
      create unique index if not exists notifications_sla_warning_assignment_recipient_uidx
        on notifications (assignment_id, recipient_id)
        where type = 'sla_warning'
    $idx$;
  end if;
end
$$;

-- Change SLA warning threshold from 30 minutes to 1 hour.
--
-- Does not edit evaluate_assignment_sla_states() as originally defined in
-- 0004 / replaced in 0016. This replacement keeps:
--   - sla_warning_sent_at idempotency (warning fires at most once)
--   - overdue threshold (now() > sla) and overdue_notified_at
--   - notification recipients (active collector + every admin)
--   - notification types (sla_warning / assignment_overdue)
--   - security definer + service_role-only execute grant
--
-- The only behavioral change is the warning window:
--   now() >= sla - interval '30 minutes'
--     →
--   now() >= sla - interval '1 hour'

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
  for v_warn in
    update assignments
    set sla_warning_sent_at = now()
    where status <> 'Completed'
      and sla_warning_sent_at is null
      and now() >= sla - interval '1 hour'
    returning id, collector_id, sla
  loop
    if is_active_collector(v_warn.collector_id) then
      insert into notifications (recipient_id, assignment_id, type, title, message)
      values (
        v_warn.collector_id, v_warn.id, 'sla_warning', 'SLA warning',
        'An assignment is due within 1 hour (SLA ' || v_warn.sla || ').'
      );
    end if;
    for v_admin in select id from profiles where role = 'admin' loop
      insert into notifications (recipient_id, assignment_id, type, title, message)
      values (
        v_admin.id, v_warn.id, 'sla_warning', 'SLA warning',
        'An assignment is due within 1 hour (SLA ' || v_warn.sla || ').'
      );
    end loop;
    v_warnings := v_warnings + 1;
  end loop;

  for v_over in
    update assignments
    set status = 'Overdue', overdue_notified_at = now()
    where status not in ('Completed', 'Overdue')
      and overdue_notified_at is null
      and now() > sla
    returning id, collector_id, sla
  loop
    if is_active_collector(v_over.collector_id) then
      insert into notifications (recipient_id, assignment_id, type, title, message)
      values (
        v_over.collector_id, v_over.id, 'assignment_overdue', 'Assignment overdue',
        'An assignment is past its SLA (' || v_over.sla || ') and not completed.'
      );
    end if;
    for v_admin in select id from profiles where role = 'admin' loop
      insert into notifications (recipient_id, assignment_id, type, title, message)
      values (
        v_admin.id, v_over.id, 'assignment_overdue', 'Assignment overdue',
        'An assignment is past its SLA (' || v_over.sla || ') and not completed.'
      );
    end loop;
    v_overdue := v_overdue + 1;
  end loop;
  return query select v_warnings, v_overdue;
end;
$$;

revoke all on function evaluate_assignment_sla_states() from public;
revoke all on function evaluate_assignment_sla_states() from anon;
revoke all on function evaluate_assignment_sla_states() from authenticated;
grant execute on function evaluate_assignment_sla_states() to service_role;

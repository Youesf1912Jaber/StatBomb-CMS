-- Collector workflow hardening: enforce active collector state in RPCs and
-- reject inactive collector targets during assignment provisioning.

create or replace function is_active_collector(p_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from profiles
    where id = p_profile_id
      and role = 'collector'
      and deleted_at is null
      and suspended_at is null
  );
$$;

revoke all on function is_active_collector(uuid) from public;
grant execute on function is_active_collector(uuid) to authenticated;

create or replace function start_assignment(p_assignment_id uuid)
returns assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_row assignments;
begin
  if v_caller is null or not is_active_collector(v_caller) then
    raise exception 'not authorized';
  end if;

  update assignments
  set status = 'In Progress', started_at = now(), updated_at = now()
  where id = p_assignment_id
    and collector_id = v_caller
    and status = 'Not Started'
  returning * into v_row;

  if not found then raise exception 'ASSIGNMENT_NOT_STARTABLE'; end if;
  return v_row;
end;
$$;

create or replace function complete_assignment(p_assignment_id uuid)
returns assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_row assignments;
begin
  if v_caller is null or not is_active_collector(v_caller) then
    raise exception 'not authorized';
  end if;

  update assignments
  set status = 'Completed', completed_at = now(), updated_at = now()
  where id = p_assignment_id
    and collector_id = v_caller
    and status = 'In Progress'
  returning * into v_row;

  if not found then raise exception 'ASSIGNMENT_NOT_COMPLETABLE'; end if;
  return v_row;
end;
$$;

create or replace function get_match_collaborators(p_match_id uuid)
returns table (
  assignment_id uuid, collector_id uuid, full_name text, task text,
  half text, status assignment_status
)
language sql
security definer
set search_path = public
stable
as $$
  select a.id, a.collector_id, p.full_name, a.task, a.half, a.status
  from assignments a
  join profiles p on p.id = a.collector_id
  where a.match_id = p_match_id
    and (is_admin() or is_active_collector(auth.uid()))
    and (
      is_admin()
      or exists (
        select 1 from assignments mine
        where mine.match_id = p_match_id and mine.collector_id = auth.uid()
      )
    );
$$;

create or replace function create_assignment(
  p_match_id uuid, p_collector_id uuid, p_raw_task_value text, p_task text,
  p_half text, p_sla timestamptz, p_shift_date date
) returns assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role user_role;
  v_conflict_id uuid;
  v_row assignments;
begin
  select role into v_caller_role from profiles where id = auth.uid();
  if v_caller_role is distinct from 'admin' then raise exception 'not authorized'; end if;
  if not is_active_collector(p_collector_id) then
    raise exception 'collector is not active';
  end if;
  select id into v_conflict_id from assignments
  where match_id = p_match_id and task = p_task and half = p_half;
  if v_conflict_id is not null then
    raise exception 'DUPLICATE_LOGICAL_ASSIGNMENT' using detail = v_conflict_id::text;
  end if;
  insert into assignments (match_id, collector_id, raw_task_value, task, half, sla, shift_date)
  values (p_match_id, p_collector_id, p_raw_task_value, p_task, p_half, p_sla, p_shift_date)
  returning * into v_row;
  return v_row;
exception when unique_violation then
  raise exception 'DUPLICATE_LOGICAL_ASSIGNMENT';
end;
$$;

create or replace function reassign_assignment(
  p_assignment_id uuid, p_new_collector_id uuid, p_mode text
) returns assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment assignments%rowtype;
  v_old_collector_id uuid;
  v_admin_id uuid := auth.uid();
begin
  if p_mode not in ('preserve', 'reset') then
    raise exception 'invalid reassignment mode';
  end if;
  if not exists (
    select 1 from profiles where id = v_admin_id and role = 'admin'
  ) then
    raise exception 'only admins can reassign assignments';
  end if;
  if not is_active_collector(p_new_collector_id) then
    raise exception 'new collector does not exist or is not active';
  end if;

  select * into v_assignment from assignments
  where id = p_assignment_id
  for update;
  if not found then raise exception 'assignment not found'; end if;
  if v_assignment.collector_id = p_new_collector_id then
    raise exception 'cannot reassign to the same collector';
  end if;
  v_old_collector_id := v_assignment.collector_id;

  update assignments
  set previous_collector_id = collector_id,
      collector_id = p_new_collector_id,
      status = case when p_mode = 'reset' then 'Not Started' else status end,
      started_at = case when p_mode = 'reset' then null else started_at end,
      completed_at = case when p_mode = 'reset' then null else completed_at end,
      updated_at = now()
  where id = p_assignment_id
  returning * into v_assignment;

  insert into activity_logs (user_id, assignment_id, action, old_value, new_value)
  values (
    v_admin_id, p_assignment_id, 'assignment_reassigned',
    jsonb_build_object('collector_id', v_old_collector_id),
    jsonb_build_object('collector_id', p_new_collector_id, 'mode', p_mode)
  );

  insert into notifications (recipient_id, assignment_id, type, title, message)
  values (
    p_new_collector_id, p_assignment_id, 'assignment_reassigned',
    'Assignment Reassigned to You',
    format('You have been assigned task "%s" (reassigned from previous collector)', v_assignment.task)
  );
  return v_assignment;
end;
$$;

drop policy if exists notifications_owner_update on notifications;
create policy notifications_owner_update on notifications
  for update
  using (recipient_id = auth.uid() and is_active_collector(auth.uid()))
  with check (recipient_id = auth.uid() and is_active_collector(auth.uid()));

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
      and now() >= sla - interval '30 minutes'
    returning id, collector_id, sla
  loop
    if is_active_collector(v_warn.collector_id) then
      insert into notifications (recipient_id, assignment_id, type, title, message)
      values (
        v_warn.collector_id, v_warn.id, 'sla_warning', 'SLA warning',
        'An assignment is due within 30 minutes (SLA ' || v_warn.sla || ').'
      );
    end if;
    for v_admin in select id from profiles where role = 'admin' loop
      insert into notifications (recipient_id, assignment_id, type, title, message)
      values (
        v_admin.id, v_warn.id, 'sla_warning', 'SLA warning',
        'An assignment is due within 30 minutes (SLA ' || v_warn.sla || ').'
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

-- Allow an active, non-deleted admin profile to be an assignment TARGET
-- (e.g. HR-Code A-2082) without changing profiles.role or is_active_collector().
-- Execution RPCs still require collector_id = auth.uid(); admins cannot execute
-- another collector's assignment. Admin bulk-complete RPCs are unchanged.

create or replace function is_assignable_collector_target(p_profile_id uuid)
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
      and role in ('collector', 'admin')
      and deleted_at is null
      and suspended_at is null
  );
$$;

revoke all on function is_assignable_collector_target(uuid) from public;
revoke all on function is_assignable_collector_target(uuid) from anon;
grant execute on function is_assignable_collector_target(uuid) to authenticated;

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
  if not is_assignable_collector_target(p_collector_id) then
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
  if not is_assignable_collector_target(p_new_collector_id) then
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
  if v_caller is null or not (
    is_active_collector(v_caller)
    or (is_admin() and is_assignable_collector_target(v_caller))
  ) then
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
  if v_caller is null or not (
    is_active_collector(v_caller)
    or (is_admin() and is_assignable_collector_target(v_caller))
  ) then
    raise exception 'not authorized';
  end if;

  select * into v_row
  from assignments
  where id = p_assignment_id
    and collector_id = v_caller
    and status in ('In Progress', 'Overdue')
  for update;

  if not found then
    raise exception 'ASSIGNMENT_NOT_COMPLETABLE';
  end if;

  if exists (
    select 1
    from assignment_task_timers
    where assignment_id = p_assignment_id
      and ended_at is null
  ) then
    raise exception 'ACTIVE_TASK_TIMER';
  end if;

  update assignments
  set status = 'Completed',
      completed_at = now(),
      started_at = coalesce(started_at, now()),
      updated_at = now()
  where id = p_assignment_id
    and collector_id = v_caller
    and status in ('In Progress', 'Overdue')
  returning * into v_row;

  if not found then
    raise exception 'ASSIGNMENT_NOT_COMPLETABLE';
  end if;

  return v_row;
end;
$$;

create or replace function start_assignment_task(p_assignment_id uuid, p_task_name text)
returns assignment_task_timers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_assignment assignments;
  v_row assignment_task_timers;
begin
  if v_caller is null or not (
    is_active_collector(v_caller)
    or (is_admin() and is_assignable_collector_target(v_caller))
  ) then
    raise exception 'not authorized';
  end if;

  if p_task_name not in (
    'Base + Extras',
    'pressure',
    'Location all',
    'Players all',
    'FF impact goal location',
    'Players +Location  Home',
    'Players +Location  Away'
  ) then
    raise exception 'INVALID_TASK_NAME';
  end if;

  select * into v_assignment
  from assignments
  where id = p_assignment_id
  for update;

  if not found then
    raise exception 'not found';
  end if;

  if v_assignment.collector_id is distinct from v_caller then
    raise exception 'not authorized';
  end if;

  if v_assignment.status = 'Completed'
     or v_assignment.status = 'Not Started'
     or v_assignment.started_at is null
     or v_assignment.completed_at is not null then
    raise exception 'ASSIGNMENT_TASK_NOT_STARTABLE';
  end if;

  if exists (
    select 1
    from assignment_task_timers
    where assignment_id = p_assignment_id
      and task_name = p_task_name
  ) then
    raise exception 'TASK_ALREADY_STARTED';
  end if;

  if exists (
    select 1
    from assignment_task_timers
    where assignment_id = p_assignment_id
      and ended_at is null
  ) then
    raise exception 'TASK_TIMER_ACTIVE';
  end if;

  insert into assignment_task_timers (assignment_id, task_name, started_at)
  values (p_assignment_id, p_task_name, now())
  returning * into v_row;

  return v_row;
exception
  when unique_violation then
    if exists (
      select 1
      from assignment_task_timers
      where assignment_id = p_assignment_id
        and task_name = p_task_name
    ) then
      raise exception 'TASK_ALREADY_STARTED';
    end if;
    raise exception 'TASK_TIMER_ACTIVE';
end;
$$;

create or replace function end_assignment_task(p_assignment_id uuid, p_task_name text)
returns assignment_task_timers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_assignment assignments;
  v_row assignment_task_timers;
begin
  if v_caller is null or not (
    is_active_collector(v_caller)
    or (is_admin() and is_assignable_collector_target(v_caller))
  ) then
    raise exception 'not authorized';
  end if;

  if p_task_name not in (
    'Base + Extras',
    'pressure',
    'Location all',
    'Players all',
    'FF impact goal location',
    'Players +Location  Home',
    'Players +Location  Away'
  ) then
    raise exception 'INVALID_TASK_NAME';
  end if;

  select * into v_assignment
  from assignments
  where id = p_assignment_id
  for update;

  if not found then
    raise exception 'not found';
  end if;

  if v_assignment.collector_id is distinct from v_caller then
    raise exception 'not authorized';
  end if;

  update assignment_task_timers
  set ended_at = now(),
      duration_seconds = greatest(
        0,
        floor(extract(epoch from (now() - started_at)))::integer
      ),
      updated_at = now()
  where assignment_id = p_assignment_id
    and task_name = p_task_name
    and ended_at is null
  returning * into v_row;

  if not found then
    raise exception 'TASK_TIMER_NOT_ACTIVE';
  end if;

  return v_row;
end;
$$;

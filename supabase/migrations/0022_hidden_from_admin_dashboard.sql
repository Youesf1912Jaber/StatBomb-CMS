-- Ensure the Admin Dashboard visibility column exists in production.
-- Idempotent: existing assignments stay visible (DEFAULT false).
-- Does not delete assignments, change the status enum, unique identity,
-- distribution_present, SLA fields, or task timer rows.

alter table public.assignments
  add column if not exists hidden_from_admin_dashboard boolean not null default false;

create index if not exists assignments_hidden_from_admin_dashboard_idx
  on public.assignments (hidden_from_admin_dashboard);

comment on column public.assignments.hidden_from_admin_dashboard is
  'True when an admin has removed the assignment from the Admin Dashboard view. The assignment row, status, timers, and history are preserved.';

create or replace function hide_assignment_from_dashboard(p_assignment_id uuid)
returns assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row assignments;
  v_admin_id uuid := auth.uid();
begin
  if v_admin_id is null or not is_admin() then
    raise exception 'not authorized';
  end if;

  select * into v_row
  from assignments
  where id = p_assignment_id
  for update;

  if not found then
    raise exception 'not found';
  end if;

  if v_row.hidden_from_admin_dashboard then
    return v_row;
  end if;

  update assignments
  set hidden_from_admin_dashboard = true,
      updated_at = now()
  where id = p_assignment_id
  returning * into v_row;

  insert into activity_logs (user_id, assignment_id, action, old_value, new_value)
  values (
    v_admin_id,
    p_assignment_id,
    'assignment_removed_from_dashboard',
    jsonb_build_object('hidden_from_admin_dashboard', false),
    jsonb_build_object('hidden_from_admin_dashboard', true)
  );

  return v_row;
end;
$$;

revoke all on function hide_assignment_from_dashboard(uuid) from public;
grant execute on function hide_assignment_from_dashboard(uuid) to authenticated;

create or replace function admin_complete_assignment(p_assignment_id uuid)
returns assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row assignments;
  v_admin_id uuid := auth.uid();
  v_old_status assignment_status;
  v_old_started_at timestamptz;
  v_old_completed_at timestamptz;
begin
  if v_admin_id is null or not is_admin() then
    raise exception 'not authorized';
  end if;

  select * into v_row
  from assignments
  where id = p_assignment_id
  for update;

  if not found then
    raise exception 'not found';
  end if;

  if v_row.status = 'Completed' then
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

  v_old_status := v_row.status;
  v_old_started_at := v_row.started_at;
  v_old_completed_at := v_row.completed_at;

  update assignments
  set status = 'Completed',
      completed_at = now(),
      started_at = coalesce(started_at, now()),
      updated_at = now()
  where id = p_assignment_id
    and status in ('Not Started', 'In Progress', 'Overdue')
  returning * into v_row;

  if not found then
    raise exception 'ASSIGNMENT_NOT_COMPLETABLE';
  end if;

  insert into activity_logs (user_id, assignment_id, action, old_value, new_value)
  values (
    v_admin_id,
    p_assignment_id,
    'assignment_completed_by_admin',
    jsonb_build_object(
      'status', v_old_status,
      'started_at', v_old_started_at,
      'completed_at', v_old_completed_at
    ),
    jsonb_build_object(
      'status', v_row.status,
      'started_at', v_row.started_at,
      'completed_at', v_row.completed_at
    )
  );

  return v_row;
end;
$$;

revoke all on function admin_complete_assignment(uuid) from public;
grant execute on function admin_complete_assignment(uuid) to authenticated;

-- Atomically complete every currently distributed, dashboard-visible assignment.
-- Distribution presence, collector ownership, SLA data, and task timers are
-- intentionally untouched.

create or replace function admin_complete_current_distribution_assignments()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_completed_count integer := 0;
begin
  if v_admin_id is null or not is_admin() then
    raise exception 'not authorized';
  end if;

  perform 1
  from assignments
  where distribution_present = true
    and hidden_from_admin_dashboard = false
    and status in ('Not Started', 'In Progress', 'Overdue')
  for update;

  if exists (
    select 1
    from assignment_task_timers timer
    join assignments assignment on assignment.id = timer.assignment_id
    where assignment.distribution_present = true
      and assignment.hidden_from_admin_dashboard = false
      and assignment.status in ('Not Started', 'In Progress', 'Overdue')
      and timer.ended_at is null
  ) then
    raise exception 'ACTIVE_TASK_TIMER';
  end if;

  with eligible as materialized (
    select id, status, started_at, completed_at
    from assignments
    where distribution_present = true
      and hidden_from_admin_dashboard = false
      and status in ('Not Started', 'In Progress', 'Overdue')
  ),
  updated as (
    update assignments assignment
    set status = 'Completed',
        completed_at = now(),
        started_at = coalesce(assignment.started_at, now()),
        updated_at = now()
    from eligible
    where assignment.id = eligible.id
    returning
      assignment.id,
      assignment.status as new_status,
      assignment.started_at as new_started_at,
      assignment.completed_at as new_completed_at,
      eligible.status as old_status,
      eligible.started_at as old_started_at,
      eligible.completed_at as old_completed_at
  )
  insert into activity_logs (user_id, assignment_id, action, old_value, new_value)
  select
    v_admin_id,
    id,
    'assignment_completed_by_admin',
    jsonb_build_object(
      'status', old_status,
      'started_at', old_started_at,
      'completed_at', old_completed_at
    ),
    jsonb_build_object(
      'status', new_status,
      'started_at', new_started_at,
      'completed_at', new_completed_at
    )
  from updated;

  get diagnostics v_completed_count = row_count;
  return v_completed_count;
end;
$$;

revoke all on function admin_complete_current_distribution_assignments() from public;
grant execute on function admin_complete_current_distribution_assignments() to authenticated;

-- Assignment task-level time tracking.
-- Additional tracking layer only: does not change assignment lifecycle,
-- unique constraints, SLA, overdue rules, or distribution.

create table assignment_task_timers (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments (id) on delete cascade,
  task_name text not null,
  started_at timestamptz not null,
  ended_at timestamptz null,
  duration_seconds integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assignment_task_timers_assignment_task_unique unique (assignment_id, task_name),
  constraint assignment_task_timers_task_name_allowed check (
    task_name in (
      'Base + Extras',
      'pressure',
      'Location all',
      'Players all',
      'FF impact goal location',
      'Players +Location  Home',
      'Players +Location  Away'
    )
  ),
  constraint assignment_task_timers_end_duration check (
    (ended_at is null and duration_seconds is null)
    or (
      ended_at is not null
      and duration_seconds is not null
      and duration_seconds >= 0
      and ended_at >= started_at
    )
  )
);

create index assignment_task_timers_assignment_id_idx
  on assignment_task_timers (assignment_id);

create index assignment_task_timers_assignment_task_name_idx
  on assignment_task_timers (assignment_id, task_name);

create unique index assignment_task_timers_one_active_per_assignment
  on assignment_task_timers (assignment_id)
  where ended_at is null;

create trigger assignment_task_timers_set_updated_at
  before update on assignment_task_timers
  for each row
  execute function set_updated_at();

alter table assignment_task_timers enable row level security;

create policy assignment_task_timers_select on assignment_task_timers
  for select
  using (
    is_admin()
    or exists (
      select 1
      from assignments a
      where a.id = assignment_task_timers.assignment_id
        and a.collector_id = auth.uid()
    )
  );

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
  if v_caller is null or not is_active_collector(v_caller) then
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

revoke all on function start_assignment_task(uuid, text) from public;
grant execute on function start_assignment_task(uuid, text) to authenticated;

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
  if v_caller is null or not is_active_collector(v_caller) then
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

revoke all on function end_assignment_task(uuid, text) from public;
grant execute on function end_assignment_task(uuid, text) to authenticated;

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

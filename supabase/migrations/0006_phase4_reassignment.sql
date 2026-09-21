-- Phase 4: Assignment Reassignment + Activity Logs
-- Adds activity_logs table, previous_collector_id column, and reassign_assignment() RPC

-- ============================================================================
-- 1. ACTIVITY LOGS TABLE
-- ============================================================================

create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  assignment_id uuid references assignments(id) on delete cascade,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

-- Index for querying logs by assignment
create index if not exists activity_logs_assignment_id_idx
  on activity_logs (assignment_id);

-- Index for querying logs by user
create index if not exists activity_logs_user_id_idx
  on activity_logs (user_id);

-- Index for querying logs by action type
create index if not exists activity_logs_action_idx
  on activity_logs (action);

-- RLS: activity logs are readable by admins only
alter table activity_logs enable row level security;

create policy activity_logs_admin_read
  on activity_logs
  for select
  to authenticated
  using (exists (
    select 1 from profiles
    where profiles.id = auth.uid()
    and profiles.role = 'admin'
  ));

-- No insert/update/delete policies for clients — all mutations happen via
-- security-definer RPCs that bypass RLS.

-- ============================================================================
-- 2. PREVIOUS COLLECTOR ID COLUMN
-- ============================================================================

alter table assignments
  add column if not exists previous_collector_id uuid references profiles(id);

-- ============================================================================
-- 3. REASSIGN_ASSIGNMENT RPC
-- ============================================================================

create or replace function reassign_assignment(
  p_assignment_id uuid,
  p_new_collector_id uuid,
  p_mode text  -- 'preserve' | 'reset'
) returns assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment assignments%rowtype;
  v_old_collector_id uuid;
  v_admin_id uuid;
begin
  -- Validate mode strictly
  if p_mode not in ('preserve', 'reset') then
    raise exception 'invalid reassignment mode: %', p_mode
      using hint = 'mode must be "preserve" or "reset"';
  end if;

  -- Verify caller is admin
  v_admin_id := auth.uid();
  if not exists (
    select 1 from profiles
    where id = v_admin_id
    and role = 'admin'
  ) then
    raise exception 'only admins can reassign assignments'
      using errcode = 'insufficient_privilege';
  end if;

  -- Fetch the assignment (with lock to prevent concurrent modifications)
  select * into v_assignment
  from assignments
  where id = p_assignment_id
  for update;

  if not found then
    raise exception 'assignment not found'
      using errcode = 'no_data_found';
  end if;

  -- Verify new collector exists and is active
  if not exists (
    select 1 from profiles
    where id = p_new_collector_id
    and role = 'collector'
  ) then
    raise exception 'new collector does not exist or is not a collector'
      using errcode = 'no_data_found';
  end if;

  -- Prevent reassigning to the same collector
  if v_assignment.collector_id = p_new_collector_id then
    raise exception 'cannot reassign to the same collector'
      using errcode = 'unique_violation';
  end if;

  -- Store old collector for activity log
  v_old_collector_id := v_assignment.collector_id;

  -- Perform reassignment
  update assignments
  set
    previous_collector_id = collector_id,
    collector_id = p_new_collector_id,
    status = case
      when p_mode = 'reset' then 'Not Started'
      else status
    end,
    started_at = case
      when p_mode = 'reset' then null
      else started_at
    end,
    completed_at = case
      when p_mode = 'reset' then null
      else completed_at
    end,
    updated_at = now()
  where id = p_assignment_id
  returning * into v_assignment;

  -- Insert activity log
  insert into activity_logs (user_id, assignment_id, action, old_value, new_value)
  values (
    v_admin_id,
    p_assignment_id,
    'assignment_reassigned',
    jsonb_build_object('collector_id', v_old_collector_id),
    jsonb_build_object(
      'collector_id', p_new_collector_id,
      'mode', p_mode
    )
  );

  -- Insert notification for new collector
  insert into notifications (recipient_id, assignment_id, type, title, message)
  values (
    p_new_collector_id,
    p_assignment_id,
    'assignment_reassigned',
    'Assignment Reassigned to You',
    format(
      'You have been assigned task "%s" (reassigned from previous collector)',
      v_assignment.task
    )
  );

  return v_assignment;
end;
$$;

-- Revoke public execute, grant to authenticated users only
revoke all on function reassign_assignment(uuid, uuid, text) from public;
grant execute on function reassign_assignment(uuid, uuid, text) to authenticated;

-- Phase 4 Step 2: Assignment Notes and Update RPC
--
-- Adds:
-- 1. notes column to assignments table (optional field for admin annotations)
-- 2. update_assignment() RPC — secure admin-only update with activity logging

-- ============================================================================
-- 1. NOTES COLUMN
-- ============================================================================

alter table assignments
  add column if not exists notes text;

-- ============================================================================
-- 2. UPDATE_ASSIGNMENT RPC
-- ============================================================================
--
-- Allows admins to update:
--   - task (with duplicate logical assignment check)
--   - half (with duplicate logical assignment check)
--   - sla (without affecting status/timestamps)
--   - notes
--
-- All changes are atomic and trigger activity logging.
-- Status, started_at, and completed_at are NOT editable and never change.
--
-- SECURITY: Security-definer RPC with admin-only authorization check.
-- ============================================================================

create or replace function update_assignment(
  p_assignment_id uuid,
  p_task text,
  p_half text,
  p_sla timestamptz,
  p_notes text
) returns assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment assignments%rowtype;
  v_old_assignment assignments%rowtype;
  v_caller_role user_role;
  v_match_id uuid;
  v_conflict_id uuid;
  v_old_value jsonb := '{}'::jsonb;
  v_new_value jsonb := '{}'::jsonb;
begin
  -- Verify caller is admin
  select role into v_caller_role from profiles where id = auth.uid();
  if v_caller_role is distinct from 'admin' then
    raise exception 'not authorized'
      using errcode = 'insufficient_privilege';
  end if;

  -- Fetch the current assignment (with lock to prevent concurrent modifications)
  select * into v_old_assignment
  from assignments
  where id = p_assignment_id
  for update;

  if not found then
    raise exception 'assignment not found'
      using errcode = 'no_data_found';
  end if;

  v_match_id := v_old_assignment.match_id;

  -- Check for duplicate logical assignment only if task or half changed
  if (p_task is distinct from v_old_assignment.task or
      p_half is distinct from v_old_assignment.half) then
    select id into v_conflict_id
    from assignments
    where match_id = v_match_id
      and task = p_task
      and half = p_half
      and id <> p_assignment_id;

    if v_conflict_id is not null then
      raise exception 'DUPLICATE_LOGICAL_ASSIGNMENT' using detail = v_conflict_id::text;
    end if;
  end if;

  -- Build old_value and new_value JSON objects for activity log
  -- Only include fields that are actually changing
  if p_task is distinct from v_old_assignment.task then
    v_old_value := v_old_value || jsonb_build_object('task', v_old_assignment.task);
    v_new_value := v_new_value || jsonb_build_object('task', p_task);
  end if;

  if p_half is distinct from v_old_assignment.half then
    v_old_value := v_old_value || jsonb_build_object('half', v_old_assignment.half);
    v_new_value := v_new_value || jsonb_build_object('half', p_half);
  end if;

  if p_sla is distinct from v_old_assignment.sla then
    v_old_value := v_old_value || jsonb_build_object('sla', v_old_assignment.sla);
    v_new_value := v_new_value || jsonb_build_object('sla', p_sla);
  end if;

  if p_notes is distinct from v_old_assignment.notes then
    v_old_value := v_old_value || jsonb_build_object('notes', v_old_assignment.notes);
    v_new_value := v_new_value || jsonb_build_object('notes', p_notes);
  end if;

  -- If nothing changed, return the unchanged assignment
  if v_old_value = '{}'::jsonb then
    return v_old_assignment;
  end if;

  -- Perform the update
  update assignments
  set
    task = p_task,
    half = p_half,
    sla = p_sla,
    notes = p_notes,
    updated_at = now()
  where id = p_assignment_id
  returning * into v_assignment;

  -- Insert activity log
  insert into activity_logs (user_id, assignment_id, action, old_value, new_value)
  values (
    auth.uid(),
    p_assignment_id,
    'assignment_updated',
    v_old_value,
    v_new_value
  );

  return v_assignment;
end;
$$;

-- Revoke public execute, grant to authenticated users only
revoke all on function update_assignment(uuid, text, text, timestamptz, text) from public;
grant execute on function update_assignment(uuid, text, text, timestamptz, text) to authenticated;

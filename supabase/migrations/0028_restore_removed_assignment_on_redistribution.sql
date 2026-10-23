-- Restore an assignment whose Distribution row was removed when the same
-- Match + Task + Half is later distributed again. Keep the existing assignment
-- record so its audit/history remains linked instead of colliding with the
-- logical-identity unique constraint.
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
  v_conflict assignments%rowtype;
  v_row assignments%rowtype;
begin
  select role into v_caller_role from profiles where id = auth.uid();
  if v_caller_role is distinct from 'admin' then
    raise exception 'not authorized';
  end if;
  if not is_assignable_collector_target(p_collector_id) then
    raise exception 'collector is not active';
  end if;

  select * into v_conflict
  from assignments
  where match_id = p_match_id and task = p_task and half = p_half
  for update;

  if found then
    if v_conflict.distribution_present then
      raise exception 'DUPLICATE_LOGICAL_ASSIGNMENT' using detail = v_conflict.id::text;
    end if;

    -- The logical assignment exists only as preserved history. Restore it to
    -- Distribution; when the collector changes, reset active progress so the
    -- new collector does not inherit a completed/in-progress state.
    update assignments
    set previous_collector_id = case
          when collector_id is distinct from p_collector_id then collector_id
          else previous_collector_id
        end,
        collector_id = p_collector_id,
        raw_task_value = p_raw_task_value,
        sla = p_sla,
        shift_date = p_shift_date,
        distribution_present = true,
        status = case
          when collector_id is distinct from p_collector_id then 'Not Started'::assignment_status
          else status
        end,
        started_at = case
          when collector_id is distinct from p_collector_id then null
          else started_at
        end,
        completed_at = case
          when collector_id is distinct from p_collector_id then null
          else completed_at
        end,
        updated_at = now()
    where id = v_conflict.id
    returning * into v_row;

    return v_row;
  end if;

  insert into assignments (match_id, collector_id, raw_task_value, task, half, sla, shift_date)
  values (p_match_id, p_collector_id, p_raw_task_value, p_task, p_half, p_sla, p_shift_date)
  returning * into v_row;
  return v_row;
exception when unique_violation then
  raise exception 'DUPLICATE_LOGICAL_ASSIGNMENT';
end;
$$;

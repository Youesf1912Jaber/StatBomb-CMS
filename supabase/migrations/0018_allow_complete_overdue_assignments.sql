-- Allow the assigned active collector to complete an Overdue assignment.
-- Overdue remains start-blocked. SLA, overdue_notified_at, and the
-- assignment unique constraint are left unchanged.

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
  set status = 'Completed',
      completed_at = now(),
      started_at = coalesce(started_at, now()),
      updated_at = now()
  where id = p_assignment_id
    and collector_id = v_caller
    and status in ('In Progress', 'Overdue')
  returning * into v_row;

  if not found then raise exception 'ASSIGNMENT_NOT_COMPLETABLE'; end if;
  return v_row;
end;
$$;

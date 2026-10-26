-- Allow a restored/reassigned overdue assignment to be started if work never began.
-- Started overdue work (started_at is not null) remains completable, not restartable.
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
    and (
      status = 'Not Started'
      or (status = 'Overdue' and started_at is null)
    )
  returning * into v_row;

  if not found then raise exception 'ASSIGNMENT_NOT_STARTABLE'; end if;
  return v_row;
end;
$$;

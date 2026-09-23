-- Distribution → assignment reconciliation.
-- Adds a persisted presence flag so assignments remain history when a
-- Google Sheets Distribution row disappears. Does not change assignment
-- status, unique identity, SLA, or task timers.

alter table public.assignments
  add column if not exists distribution_present boolean not null default true;

create index if not exists assignments_distribution_present_idx
  on public.assignments (distribution_present);

comment on column public.assignments.distribution_present is
  'True when a matching current Google Sheets Distribution row exists. False when that Distribution row was removed. Assignments are never deleted and status is never cancelled.';

create or replace function protect_assignment_distribution_present()
returns trigger
language plpgsql
as $$
declare
  v_jwt_role text;
begin
  if new.distribution_present is not distinct from old.distribution_present then
    return new;
  end if;

  v_jwt_role := coalesce(current_setting('request.jwt.claim.role', true), '');
  if v_jwt_role = '' then
    begin
      v_jwt_role := coalesce(
        current_setting('request.jwt.claims', true)::jsonb ->> 'role',
        ''
      );
    exception when others then
      v_jwt_role := '';
    end;
  end if;

  if is_admin() or v_jwt_role = 'service_role' then
    return new;
  end if;

  raise exception 'not authorized to change distribution_present';
end;
$$;

drop trigger if exists assignments_protect_distribution_present on public.assignments;
create trigger assignments_protect_distribution_present
  before update on public.assignments
  for each row
  execute function protect_assignment_distribution_present();

create or replace function reconcile_distribution_presence(
  p_present_ids uuid[],
  p_match_id uuid default null
)
returns table (updated_present integer, updated_missing integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_present integer := 0;
  v_updated_missing integer := 0;
  v_present_ids uuid[] := coalesce(p_present_ids, '{}'::uuid[]);
  v_jwt_role text;
begin
  v_jwt_role := coalesce(current_setting('request.jwt.claim.role', true), '');
  if v_jwt_role = '' then
    begin
      v_jwt_role := coalesce(
        current_setting('request.jwt.claims', true)::jsonb ->> 'role',
        ''
      );
    exception when others then
      v_jwt_role := '';
    end;
  end if;

  if not is_admin() and v_jwt_role <> 'service_role' then
    raise exception 'not authorized';
  end if;

  update assignments
  set distribution_present = true
  where id = any(v_present_ids)
    and (p_match_id is null or match_id = p_match_id)
    and distribution_present is distinct from true;
  get diagnostics v_updated_present = row_count;

  update assignments
  set distribution_present = false
  where (p_match_id is null or match_id = p_match_id)
    and not (id = any(v_present_ids))
    and distribution_present is distinct from false;
  get diagnostics v_updated_missing = row_count;

  return query select v_updated_present, v_updated_missing;
end;
$$;

revoke all on function reconcile_distribution_presence(uuid[], uuid) from public;
grant execute on function reconcile_distribution_presence(uuid[], uuid) to authenticated;

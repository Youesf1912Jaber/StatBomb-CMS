-- Expose only teammate contact fields needed by authenticated collectors.
-- This preserves the strict profiles RLS policy (collectors cannot read profiles directly).

create or replace function get_match_collaborators_contact(p_match_id uuid)
returns table (
  assignment_id uuid,
  collector_id uuid,
  full_name text,
  task text,
  half text,
  status assignment_status,
  hr_code text,
  phone text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    a.id,
    a.collector_id,
    p.full_name,
    a.task,
    a.half,
    a.status,
    p.hr_code,
    p.phone
  from assignments a
  join profiles p on p.id = a.collector_id
  where a.match_id = p_match_id
    and auth.uid() is not null
    and (is_admin() or is_active_collector(auth.uid()))
    and (
      is_admin()
      or exists (
        select 1
        from assignments mine
        where mine.match_id = p_match_id
          and mine.collector_id = auth.uid()
      )
    );
$$;

create or replace function get_collector_teammates()
returns table (
  id uuid,
  full_name text,
  hr_code text,
  phone text,
  team text,
  status text
)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.full_name, p.hr_code, p.phone, p.team, p.status
  from profiles p
  where p.role = 'collector'
    and p.deleted_at is null
    and p.suspended_at is null
    and auth.uid() is not null
    and (is_admin() or is_active_collector(auth.uid()))
  order by p.full_name nulls last, p.hr_code nulls last;
$$;

revoke all on function get_match_collaborators_contact(uuid) from public;
revoke all on function get_collector_teammates() from public;
grant execute on function get_match_collaborators_contact(uuid) to authenticated;
grant execute on function get_collector_teammates() to authenticated;

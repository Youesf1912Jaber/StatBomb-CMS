-- Assignments removed from the live Distribution sheet remain in the database
-- for history, but must no longer appear as active collaborators on a match.
create or replace function get_match_collaborators(p_match_id uuid)
returns table (
  assignment_id uuid, collector_id uuid, full_name text, task text,
  half text, status assignment_status
)
language sql
security definer
set search_path = public
stable
as $$
  select a.id, a.collector_id, p.full_name, a.task, a.half, a.status
  from assignments a
  join profiles p on p.id = a.collector_id
  where a.match_id = p_match_id
    and a.distribution_present = true
    and (is_admin() or is_active_collector(auth.uid()))
    and (
      is_admin()
      or exists (
        select 1 from assignments mine
        where mine.match_id = p_match_id
          and mine.collector_id = auth.uid()
          and mine.distribution_present = true
      )
    );
$$;

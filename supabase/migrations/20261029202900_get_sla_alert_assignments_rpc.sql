create or replace function public.get_sla_alert_assignments(p_scope text default 'collector')
returns table (
  assignment_id uuid,
  sla timestamptz,
  status public.assignment_status,
  home_team text,
  away_team text,
  competition text,
  collector_name text,
  half text,
  task text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    a.id as assignment_id,
    a.sla,
    a.status,
    m.home_team,
    m.away_team,
    m.competition,
    coalesce(c.full_name, c.email, 'Unknown collector') as collector_name,
    a.half,
    a.task
  from public.assignments as a
  join public.matches as m on m.id = a.match_id
  left join public.profiles as c on c.id = a.collector_id
  where a.status <> 'Completed'::public.assignment_status
    and a.sla >= now()
    and a.sla < now() + interval '1 hour'
    and (
      (
        p_scope = 'admin'
        and exists (
          select 1 from public.profiles as me
          where me.id = auth.uid() and me.role = 'admin'
        )
        and a.hidden_from_admin_dashboard = false
        and a.distribution_present = true
      )
      or
      (
        p_scope = 'collector'
        and a.collector_id = auth.uid()
        and (
          a.distribution_present = true
          or a.status in ('In Progress'::public.assignment_status, 'Overdue'::public.assignment_status)
        )
      )
    )
  order by a.sla asc;
$$;

revoke all on function public.get_sla_alert_assignments(text) from public;
grant execute on function public.get_sla_alert_assignments(text) to authenticated;

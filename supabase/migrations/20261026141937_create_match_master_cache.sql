create table if not exists public.match_master_cache (
  match_id text primary key,
  eta_date date,
  sla_sort_at timestamptz,
  home_team text,
  away_team text,
  match_data jsonb not null,
  synced_at timestamptz not null default now()
);

create index if not exists match_master_cache_eta_sla_idx
  on public.match_master_cache (eta_date asc, sla_sort_at asc nulls last, match_id asc);
create index if not exists match_master_cache_home_team_idx
  on public.match_master_cache (lower(home_team));
create index if not exists match_master_cache_away_team_idx
  on public.match_master_cache (lower(away_team));

alter table public.match_master_cache enable row level security;
grant select on public.match_master_cache to authenticated;
grant all on public.match_master_cache to service_role;

drop policy if exists "Admins can read Match Master cache" on public.match_master_cache;
create policy "Admins can read Match Master cache"
  on public.match_master_cache
  for select
  to authenticated
  using (public.is_admin());

create or replace function public.get_match_master_eta_days()
returns table (eta_date date, match_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.eta_date, count(*)::bigint as match_count
  from public.match_master_cache as c
  where c.eta_date is not null
  group by c.eta_date
  order by c.eta_date desc;
$$;
revoke all on function public.get_match_master_eta_days() from public, anon;
grant execute on function public.get_match_master_eta_days() to authenticated, service_role;

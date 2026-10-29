-- Persist the Match Master active window independently of the calendar.
-- Historical cache rows remain stored; the UI only reads the active 10-day window.
create table if not exists public.match_master_active_window (
  singleton boolean primary key default true check (singleton),
  window_start_date date not null,
  window_end_date date not null,
  active_match_count integer not null default 0 check (active_match_count >= 0),
  updated_at timestamptz not null default now(),
  check (window_start_date <= window_end_date)
);

comment on table public.match_master_active_window is
  'Persistent 10-calendar-day Match Master window; older cache rows are retained as archive.';

alter table public.match_master_active_window enable row level security;
revoke all on table public.match_master_active_window from public, anon;
grant select on public.match_master_active_window to authenticated;
grant all on public.match_master_active_window to service_role;

drop policy if exists "Admins can read Match Master active window" on public.match_master_active_window;
create policy "Admins can read Match Master active window"
  on public.match_master_active_window
  for select
  to authenticated
  using (public.is_admin());

create or replace function public.get_match_master_active_window()
returns table (
  window_start_date date,
  window_end_date date,
  active_match_count integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select w.window_start_date, w.window_end_date, w.active_match_count
  from public.match_master_active_window as w
  where w.singleton = true;
$$;

revoke all on function public.get_match_master_active_window() from public, anon;
grant execute on function public.get_match_master_active_window() to authenticated, service_role;

create or replace function public.get_match_master_eta_days()
returns table (eta_date date, match_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.eta_date, count(*)::bigint as match_count
  from public.match_master_cache as c
  cross join public.match_master_active_window as w
  where c.eta_date is not null
    and w.singleton = true
    and c.eta_date between w.window_start_date and w.window_end_date
  group by c.eta_date
  order by c.eta_date desc;
$$;

revoke all on function public.get_match_master_eta_days() from public, anon;
grant execute on function public.get_match_master_eta_days() to authenticated, service_role;

-- Serialize Match Master cache sync and Apply across Vercel instances.
create table if not exists public.match_master_sync_lock (
  lock_name text primary key,
  lock_token uuid not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.match_master_sync_lock enable row level security;
revoke all on table public.match_master_sync_lock from public, anon, authenticated;
grant all on table public.match_master_sync_lock to service_role;

create or replace function public.acquire_match_master_sync_lock(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  acquired boolean := false;
begin
  insert into public.match_master_sync_lock (lock_name, lock_token, expires_at, updated_at)
  values ('global', p_token, now() + interval '10 minutes', now())
  on conflict (lock_name) do update
    set lock_token = excluded.lock_token,
        expires_at = excluded.expires_at,
        updated_at = now()
    where public.match_master_sync_lock.expires_at < now()
  returning true into acquired;

  return coalesce(acquired, false);
end;
$$;

create or replace function public.release_match_master_sync_lock(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  released integer;
begin
  delete from public.match_master_sync_lock
  where lock_name = 'global' and lock_token = p_token;
  get diagnostics released = row_count;
  return released = 1;
end;
$$;

revoke all on function public.acquire_match_master_sync_lock(uuid) from public, anon, authenticated;
revoke all on function public.release_match_master_sync_lock(uuid) from public, anon, authenticated;
grant execute on function public.acquire_match_master_sync_lock(uuid) to service_role;
grant execute on function public.release_match_master_sync_lock(uuid) to service_role;

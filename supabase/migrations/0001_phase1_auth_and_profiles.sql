-- Phase 1: authentication foundation — user_role enum, profiles table,
-- is_admin() helper, RLS, and the trigger that provisions a profile row
-- for every new auth.users row.
--
-- Everything else in the final spec (assignments, matches, sync_runs, etc.)
-- is added by later-phase migrations — do not add those tables here.

-- ---------------------------------------------------------------------
-- 1. Enum
-- ---------------------------------------------------------------------
create type user_role as enum ('admin', 'collector');

-- ---------------------------------------------------------------------
-- 2. profiles
-- ---------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role user_role not null default 'collector',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on profiles (role);

-- ---------------------------------------------------------------------
-- 3. updated_at maintenance
-- ---------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on profiles
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- 4. is_admin() — security-definer helper used by RLS policies.
--
-- RLS policies on `profiles` cannot directly do
-- `exists (select 1 from profiles where id = auth.uid() and role = 'admin')`
-- without recursing back into the same policy. Wrapping the check in a
-- security-definer function (owned by a role that bypasses RLS) breaks
-- that recursion. This is also the `is_admin()` referenced in the final
-- spec's route/RLS checks for admin-only surfaces in later phases.
-- ---------------------------------------------------------------------
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function is_admin from public;
grant execute on function is_admin to authenticated;

-- ---------------------------------------------------------------------
-- 5. Prevent self role-escalation.
--
-- Non-admins may update their own profile (e.g. full_name later on) but
-- must never be able to change their own `role`. Only an admin (via a
-- dedicated RPC in a later phase, or directly) can change a role.
-- ---------------------------------------------------------------------
create or replace function prevent_role_self_escalation()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role and not is_admin() then
    raise exception 'not authorized to change role';
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_role_self_escalation
  before update on profiles
  for each row
  execute function prevent_role_self_escalation();

-- ---------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------
alter table profiles enable row level security;

create policy profiles_select on profiles
  for select
  using (id = auth.uid() or is_admin());

create policy profiles_update on profiles
  for update
  using (id = auth.uid() or is_admin())
  with check (id = auth.uid() or is_admin());

-- No insert/delete policy for `authenticated`: profile rows are created only
-- by the handle_new_user trigger below (runs as table owner, bypasses RLS)
-- and deletion cascades from auth.users, never from the app.

-- ---------------------------------------------------------------------
-- 7. Auto-provision a profile row for every new auth user.
--
-- Default role is 'collector'. Promoting the first admin account is a
-- one-time manual step (see README) since there is no signed-in admin yet
-- to perform it through the app.
-- ---------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function handle_new_user();

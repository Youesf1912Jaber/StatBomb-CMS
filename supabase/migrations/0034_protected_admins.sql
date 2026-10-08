-- Protected-admin source of truth and database-level enforcement.
--
-- Why this must live in the database, not the API or UI:
--   Admin management uses the Supabase service-role client, which bypasses
--   RLS. Authenticated admins can also UPDATE public.profiles directly.
--   UI hiding and API checks are not a security boundary. A BEFORE UPDATE
--   trigger fires for every UPDATE, including service-role writes, and is
--   therefore the real protection for the four permanent admins.
--
-- This migration does not weaken prevent_role_self_escalation(), does not
-- change the admin/collector enum, and does not remove last-admin protection.

alter table public.profiles
  add column if not exists is_protected_admin boolean not null default false;

comment on column public.profiles.is_protected_admin is
  'Permanent/core admin flag. Enforced by protect_protected_admins() for every UPDATE, including service-role. Temporary admins stay false.';

-- Fail safely unless each expected HR-Code + email pair matches exactly one
-- current admin. Identities are not UUIDs; production user ids are unknown.
do $protect$
declare
  v_failures text[] := '{}';
  v_expected record;
  v_match_count integer;
  v_hr_count integer;
  v_email_count integer;
  v_role public.user_role;
  v_protected_count integer;
begin
  for v_expected in
    select *
    from (
      values
        ('A-1271', 'mohamed.nour@hudl.com'),
        ('A-2082', 'yousefabdelgaberarqam@gmail.com'),
        ('A-325', 'ahmedghanem19997@gmail.com'),
        ('A-765', 'mohamedarqam90@gmail.com')
    ) as identities(hr_code, email)
  loop
    select count(*)
      into v_match_count
    from public.profiles
    where upper(btrim(coalesce(hr_code, ''))) = v_expected.hr_code
      and lower(btrim(email)) = v_expected.email;

    if v_match_count > 1 then
      v_failures := v_failures || format(
        'duplicate profiles match protected admin identity %s / %s',
        v_expected.hr_code,
        v_expected.email
      );
    elsif v_match_count = 1 then
      select role
        into v_role
      from public.profiles
      where upper(btrim(coalesce(hr_code, ''))) = v_expected.hr_code
        and lower(btrim(email)) = v_expected.email;

      if v_role is distinct from 'admin' then
        v_failures := v_failures || format(
          'protected admin identity %s / %s is not currently role=admin',
          v_expected.hr_code,
          v_expected.email
        );
      end if;
    else
      select count(*)
        into v_hr_count
      from public.profiles
      where upper(btrim(coalesce(hr_code, ''))) = v_expected.hr_code;

      select count(*)
        into v_email_count
      from public.profiles
      where lower(btrim(email)) = v_expected.email;

      if v_hr_count > 0 or v_email_count > 0 then
        v_failures := v_failures || format(
          'HR-Code/email do not match for protected admin identity %s / %s',
          v_expected.hr_code,
          v_expected.email
        );
      else
        v_failures := v_failures || format(
          'protected admin identity does not exist: %s / %s',
          v_expected.hr_code,
          v_expected.email
        );
      end if;
    end if;
  end loop;

  if coalesce(array_length(v_failures, 1), 0) > 0 then
    raise exception 'protected admin migration failed: %', array_to_string(v_failures, '; ');
  end if;

  update public.profiles as profile
  set is_protected_admin = true
  from (
    values
      ('A-1271', 'mohamed.nour@hudl.com'),
      ('A-2082', 'yousefabdelgaberarqam@gmail.com'),
      ('A-325', 'ahmedghanem19997@gmail.com'),
      ('A-765', 'mohamedarqam90@gmail.com')
  ) as identities(hr_code, email)
  where upper(btrim(coalesce(profile.hr_code, ''))) = identities.hr_code
    and lower(btrim(profile.email)) = identities.email
    and profile.role = 'admin';

  select count(*)
    into v_protected_count
  from public.profiles
  where is_protected_admin;

  if v_protected_count is distinct from 4 then
    raise exception
      'protected admin migration failed: expected exactly 4 protected admins, found %',
      v_protected_count;
  end if;
end
$protect$;

-- Unconditional: do not consult auth.uid(), is_admin(), JWT claims, or
-- service_role. Service-role writes must be rejected the same as any other
-- UPDATE when the row is a protected admin.
create or replace function public.protect_protected_admins()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.is_protected_admin is not true then
    return new;
  end if;

  if new.role is distinct from 'admin' then
    raise exception 'protected admin cannot change role away from admin';
  end if;

  if new.hr_code is distinct from old.hr_code then
    raise exception 'protected admin HR-Code cannot be changed';
  end if;

  if new.email is distinct from old.email then
    raise exception 'protected admin email cannot be changed';
  end if;

  if new.deleted_at is distinct from old.deleted_at then
    raise exception 'protected admin cannot be deleted';
  end if;

  if new.suspended_at is distinct from old.suspended_at then
    raise exception 'protected admin cannot be suspended';
  end if;

  if new.is_protected_admin is distinct from true then
    raise exception 'protected admin protection cannot be removed';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_protected_admins on public.profiles;
create trigger profiles_protect_protected_admins
  before update on public.profiles
  for each row
  execute function public.protect_protected_admins();

comment on function public.protect_protected_admins() is
  'Database security boundary for permanent admins. Applies to every UPDATE, including service-role. Does not use RLS, auth.uid(), or is_admin().';

-- Last-admin defense in depth. Matches existing API demotion protection
-- (cannot leave zero role=admin rows) and also blocks soft-deleting the last
-- non-deleted admin. Promoting collectors is unaffected. Protected-admin
-- rules remain stricter for the four permanent identities.
create or replace function public.protect_last_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'admin' and new.role is distinct from 'admin' then
    if not exists (
      select 1
      from public.profiles as remaining
      where remaining.id is distinct from old.id
        and remaining.role = 'admin'
    ) then
      raise exception 'The last remaining admin cannot be downgraded.';
    end if;
  end if;

  if old.role = 'admin'
     and old.deleted_at is null
     and new.deleted_at is not null then
    if not exists (
      select 1
      from public.profiles as remaining
      where remaining.id is distinct from old.id
        and remaining.role = 'admin'
        and remaining.deleted_at is null
    ) then
      raise exception 'The last remaining admin cannot be deleted.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_last_admin on public.profiles;
create trigger profiles_protect_last_admin
  before update on public.profiles
  for each row
  execute function public.protect_last_admin();

comment on function public.protect_last_admin() is
  'Prevents the last remaining admin from being demoted or soft-deleted. Complements API last-admin checks and does not bypass protected-admin rules.';

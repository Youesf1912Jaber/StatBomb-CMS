-- Phase 5 preview normalization: persist the operational collector HR code.

alter table profiles
  add column if not exists hr_code text;

create unique index if not exists profiles_hr_code_unique_idx
  on profiles (lower(hr_code))
  where hr_code is not null;

create or replace function prevent_role_self_escalation()
returns trigger
language plpgsql
as $$
begin
  if (
    new.role is distinct from old.role
    or new.hr_code is distinct from old.hr_code
  ) and not is_admin() then
    raise exception 'not authorized to change role or HR code';
  end if;
  return new;
end;
$$;

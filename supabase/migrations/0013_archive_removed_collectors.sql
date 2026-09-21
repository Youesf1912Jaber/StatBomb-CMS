-- Preserve profile identity for historical assignments while removing
-- permanently departed collectors from the active operational roster.

alter table profiles
  add column if not exists deleted_at timestamptz;

create index if not exists profiles_active_role_idx
  on profiles (role)
  where deleted_at is null;

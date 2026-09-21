alter table profiles
  add column if not exists suspended_at timestamptz;

create index if not exists profiles_suspended_idx
  on profiles (suspended_at)
  where role = 'collector' and deleted_at is null;

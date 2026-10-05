-- Expected: synchronized local cache of the official Expected Google Sheet.
-- The sheet remains the source of truth. Authenticated clients may read the
-- cache; writes are performed later server-side with the service role.

create table expected_weeks (
  id uuid primary key default gen_random_uuid(),
  week_key text not null unique,
  week_start_date date not null,
  week_end_date date not null,
  shift_name text,
  shift_start_time text,
  shift_end_time text,
  sheet_header_row integer not null,
  sheet_start_row integer not null,
  sheet_end_row integer not null,
  source_present boolean not null default true,
  last_seen_at timestamptz not null default now(),
  first_synced_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index expected_weeks_start_date_idx on expected_weeks (week_start_date);
create index expected_weeks_source_present_idx on expected_weeks (source_present);

create trigger expected_weeks_set_updated_at
  before update on expected_weeks
  for each row
  execute function set_updated_at();

create table expected_week_collectors (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references expected_weeks (id) on delete cascade,
  hr_code text not null,
  collector_name text,
  collector_type text,
  sunday text,
  monday text,
  tuesday text,
  wednesday text,
  thursday text,
  friday text,
  saturday text,
  sheet_row_number integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (week_id, hr_code)
);

create index expected_week_collectors_week_id_idx on expected_week_collectors (week_id);
create index expected_week_collectors_hr_code_idx on expected_week_collectors (hr_code);

create trigger expected_week_collectors_set_updated_at
  before update on expected_week_collectors
  for each row
  execute function set_updated_at();

alter table expected_weeks enable row level security;
alter table expected_week_collectors enable row level security;

create policy expected_weeks_select on expected_weeks
  for select
  using (auth.uid() is not null);

create policy expected_week_collectors_select on expected_week_collectors
  for select
  using (auth.uid() is not null);

grant select on table expected_weeks to authenticated;
grant select on table expected_week_collectors to authenticated;

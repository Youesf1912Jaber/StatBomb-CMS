-- Over Target: dedicated classification records for extra/over-target
-- assignments. This is NOT a replacement for assignments.
--
-- Existing assignment identity UNIQUE (match_id, task, half) is unchanged.
-- A single assignment may have at most one Over Target row (partial unique
-- index on assignment_id). Historical Google Sheet rows may be imported
-- with assignment_id NULL.
--
-- week_date is the date the match was distributed as Over Target, not a
-- Sunday week-start.
--
-- Count is how many times the collector worked that match (1-4). NULL is
-- allowed only so historical sheet rows with an empty Count can be imported.
--
-- Done is stored as opaque nullable fields until its business meaning is
-- defined. It is not connected to assignment status or collector completion.

create table over_target (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references assignments (id) on delete set null,
  match_id uuid references matches (id) on delete set null,
  match_external_id text not null,
  week_date date,
  week_date_raw text,
  hr_code text not null default '',
  collector_id uuid references profiles (id) on delete set null,
  collector_name text,
  team text,
  count_value integer,
  count_raw text,
  done boolean,
  done_raw text,
  source text not null,
  source_key text not null unique,
  content_fingerprint text not null,
  occurrence_ordinal integer not null default 1,
  sheet_row_number integer,
  sheet_tab text,
  sheet_gid integer,
  sheet_sync_status text not null,
  sheet_synced_at timestamptz,
  last_sheet_error text,
  source_present boolean not null default true,
  last_seen_at timestamptz not null default now(),
  first_synced_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint over_target_count_value_check
    check (count_value is null or count_value between 1 and 4),
  constraint over_target_occurrence_ordinal_check
    check (occurrence_ordinal >= 1),
  constraint over_target_source_check
    check (source in ('app', 'google_sheet')),
  constraint over_target_sheet_sync_status_check
    check (sheet_sync_status in ('pending', 'synced', 'failed', 'imported'))
);

comment on table over_target is
  'Classification that an assignment is Over Target. Not a replacement for assignments. Count is 1-4 times the collector worked the match; NULL only for historical imported sheet rows. Done is opaque until its business meaning is defined. week_date is the Over Target distribution date, not Sunday week-start.';

comment on column over_target.week_date is
  'Date the match was distributed as Over Target. Not a Sunday week-start.';

comment on column over_target.count_value is
  'How many times the collector worked that match. Allowed values: 1-4. NULL only for historical imported rows.';

comment on column over_target.done is
  'Opaque Done flag from the Over Target sheet. Not connected to assignment status.';

create unique index over_target_assignment_id_unique_idx
  on over_target (assignment_id)
  where assignment_id is not null;

create index over_target_hr_code_idx on over_target (lower(hr_code));
create index over_target_collector_id_idx on over_target (collector_id);
create index over_target_match_external_id_idx on over_target (match_external_id);
create index over_target_week_date_idx on over_target (week_date);
create index over_target_source_present_idx on over_target (source_present);
create index over_target_sheet_sync_status_idx on over_target (sheet_sync_status);
create index over_target_content_fingerprint_idx on over_target (content_fingerprint);

create trigger over_target_set_updated_at
  before update on over_target
  for each row
  execute function set_updated_at();

alter table over_target enable row level security;

create policy over_target_select on over_target
  for select
  using (
    (
      hr_code <> ''
      and exists (
        select 1
        from profiles p
        where p.id = auth.uid()
          and p.hr_code is not null
          and lower(p.hr_code) = lower(over_target.hr_code)
      )
    )
    or is_admin()
  );

grant select on table over_target to authenticated;

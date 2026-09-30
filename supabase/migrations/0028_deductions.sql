-- Deductions: synchronized read-only cache of the official Deduction2026
-- Google Sheet. The application never writes back to that sheet.

create table deductions (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  content_fingerprint text not null,
  occurrence_ordinal integer not null check (occurrence_ordinal >= 1),
  match_external_id text not null default '',
  app text,
  hr_code text not null default '',
  collector_name text,
  collector_id uuid references profiles (id),
  squad text,
  side text,
  half text,
  event_timestamp timestamptz,
  event_timestamp_raw text,
  event text,
  comment text,
  review_date date,
  review_date_raw text,
  link text,
  source_present boolean not null default true,
  last_seen_at timestamptz not null default now(),
  first_synced_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index deductions_content_fingerprint_idx on deductions (content_fingerprint);
create index deductions_hr_code_idx on deductions (lower(hr_code));
create index deductions_collector_id_idx on deductions (collector_id);
create index deductions_match_external_id_idx on deductions (match_external_id);
create index deductions_review_date_idx on deductions (review_date);
create index deductions_event_timestamp_idx on deductions (event_timestamp);
create index deductions_source_present_idx on deductions (source_present);
create index deductions_last_seen_at_idx on deductions (last_seen_at);

create trigger deductions_set_updated_at
  before update on deductions
  for each row
  execute function set_updated_at();

alter table deductions enable row level security;

create policy deductions_select on deductions
  for select
  using (
    (
      hr_code <> ''
      and exists (
        select 1
        from profiles p
        where p.id = auth.uid()
          and p.hr_code is not null
          and lower(p.hr_code) = lower(deductions.hr_code)
      )
    )
    or is_admin()
  );

grant select on table deductions to authenticated;

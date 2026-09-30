-- FF Shots: synchronized read-only cache of the official FF - Shots 2026
-- Google Sheet. The application never writes back to that sheet.

create table ff_shots (
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
  player_id text,
  review_date date,
  review_date_raw text,
  comment text,
  link text,
  correct_collector text,
  changed text,
  source_present boolean not null default true,
  last_seen_at timestamptz not null default now(),
  first_synced_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ff_shots_content_fingerprint_idx on ff_shots (content_fingerprint);
create index ff_shots_hr_code_idx on ff_shots (lower(hr_code));
create index ff_shots_collector_id_idx on ff_shots (collector_id);
create index ff_shots_match_external_id_idx on ff_shots (match_external_id);
create index ff_shots_review_date_idx on ff_shots (review_date);
create index ff_shots_event_timestamp_idx on ff_shots (event_timestamp);
create index ff_shots_source_present_idx on ff_shots (source_present);
create index ff_shots_last_seen_at_idx on ff_shots (last_seen_at);

create trigger ff_shots_set_updated_at
  before update on ff_shots
  for each row
  execute function set_updated_at();

alter table ff_shots enable row level security;

create policy ff_shots_select on ff_shots
  for select
  using (
    (
      hr_code <> ''
      and exists (
        select 1
        from profiles p
        where p.id = auth.uid()
          and p.hr_code is not null
          and lower(p.hr_code) = lower(ff_shots.hr_code)
      )
    )
    or is_admin()
  );

grant select on table ff_shots to authenticated;

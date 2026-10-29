-- Track a stable fingerprint per ETA day so Match Master sync can skip
-- unchanged days without rewriting their cached match rows.
create table if not exists public.match_master_eta_fingerprints (
  eta_date date primary key,
  source_fingerprint text not null,
  match_count integer not null default 0 check (match_count >= 0),
  synced_at timestamptz not null default now()
);

comment on table public.match_master_eta_fingerprints is
  'Per-ETA-day fingerprints used by Match Master incremental synchronization.';

comment on column public.match_master_eta_fingerprints.source_fingerprint is
  'SHA-256 fingerprint of the normalized, deterministically sorted source rows for this ETA date.';

alter table public.match_master_eta_fingerprints enable row level security;

revoke all on table public.match_master_eta_fingerprints from public, anon, authenticated;
grant all on table public.match_master_eta_fingerprints to service_role;

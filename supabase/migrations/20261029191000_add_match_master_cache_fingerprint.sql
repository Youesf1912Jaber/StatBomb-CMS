alter table public.match_master_cache
  add column if not exists source_fingerprint text;

comment on column public.match_master_cache.source_fingerprint is
  'SHA-256 fingerprint of the selected Google Sheets Match Master source row; used to skip unchanged cache writes and avoid downloading full JSON snapshots during periodic sync.';

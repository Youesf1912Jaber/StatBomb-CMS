-- Phase 5 Step 1: Sync schema foundation
-- Adds sync_runs and sync_row_issues to support the preview-first XLSX sync pipeline

-- ==========================================================================
-- 1. ENUMS
-- ==========================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sync_run_status') THEN
    CREATE TYPE sync_run_status AS ENUM ('preview','running','success','failed');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sync_issue_severity') THEN
    CREATE TYPE sync_issue_severity AS ENUM ('warning','error');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sync_issue_type') THEN
    CREATE TYPE sync_issue_type AS ENUM (
      'validation_error',
      'task_normalization_warning',
      'duplicate_logical_key_conflict',
      'unknown_hr_code',
      'invalid_date_time',
      'invalid_url',
      'other'
    );
  END IF;
END
$$;

-- ==========================================================================
-- 2. sync_runs table
-- ==========================================================================

create table if not exists sync_runs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references profiles(id) on delete set null,
  -- file/source identification
  source text not null default 'upload', -- e.g. 'upload' | 'google_sheets' | 'csv'
  file_name text,
  file_size bigint,
  sheets jsonb, -- optional list/metadata about sheets
  metadata jsonb, -- arbitrary metadata from upload/preview stage

  -- preview-first lifecycle
  status sync_run_status not null default 'preview',

  -- counters (populated during preview and updated on import)
  total_rows integer default 0 not null,
  rows_imported integer default 0 not null,
  rows_updated integer default 0 not null,
  rows_reassigned integer default 0 not null,
  rows_skipped integer default 0 not null,
  rows_errored integer default 0 not null,

  -- timestamps
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists sync_runs_created_at_idx on sync_runs (created_at desc);
create index if not exists sync_runs_status_idx on sync_runs (status);

-- RLS: restrict access to admins only (select)
alter table sync_runs enable row level security;

create policy sync_runs_admin_read
  on sync_runs
  for select
  to authenticated
  using (exists (
    select 1 from profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  ));

-- Do not create broad insert/update/delete policies here; writes should be
-- performed by server-side functions or service-role usage.

-- ==========================================================================
-- 3. sync_row_issues table
-- ==========================================================================

create table if not exists sync_row_issues (
  id uuid primary key default gen_random_uuid(),
  sync_run_id uuid not null references sync_runs(id) on delete cascade,
  -- Row identification: row_number for spreadsheet rows (1-based),
  -- and optional row_key for structured imports
  row_number integer,
  row_key text,

  -- Optional references to domain entities if available from preview
  match_id uuid references matches(id) on delete set null,
  assignment_id uuid references assignments(id) on delete set null,

  -- Raw row data to help display context in preview (not required but useful)
  row_data jsonb,

  severity sync_issue_severity not null,
  issue_type sync_issue_type not null,
  message text,

  created_at timestamptz not null default now()
);

-- Indexes to support common queries
create index if not exists sync_row_issues_run_id_idx on sync_row_issues (sync_run_id);
create index if not exists sync_row_issues_severity_idx on sync_row_issues (severity);
create index if not exists sync_row_issues_issue_type_idx on sync_row_issues (issue_type);
create index if not exists sync_row_issues_row_number_idx on sync_row_issues (sync_run_id, row_number);

-- RLS: restrict read access to admins
alter table sync_row_issues enable row level security;

create policy sync_row_issues_admin_read
  on sync_row_issues
  for select
  to authenticated
  using (exists (
    select 1 from profiles
    where profiles.id = auth.uid()
      and profiles.role = 'admin'
  ));

-- As with sync_runs, writes should be controlled via server-side functions
-- or service-role usage, so no broad client-side insert/update/delete policies
-- are added here.

-- ==========================================================================
-- 4. Additional helpful indexes
-- ==========================================================================

-- Fast lookup of recent runs
create index if not exists sync_runs_created_at_desc_idx on sync_runs (created_at desc);

-- Fast lookup by issue type + severity for reporting
create index if not exists sync_row_issues_type_severity_idx on sync_row_issues (issue_type, severity);

-- ==========================================================================
-- 5. NOTES
-- ==========================================================================
-- Security notes:
-- * sync_runs and sync_row_issues are admin-only for read access via RLS policies
-- * writes are intentionally left to server-side code that uses the service role
--   or security-definer functions which must perform their own admin checks.
-- * If security-definer functions are later added, ensure they set search_path
--   explicitly (SET search_path = public) and validate profiles.role = 'admin'.

-- End of migration

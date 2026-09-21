-- Phase 2: matches, assignments, Start Work / Complete Work RPCs, and
-- duplicate-logical-assignment-protected create/edit RPCs.
--
-- Explicitly OUT of scope for this migration (belongs to later phases):
--   - 'Overdue' status value / SLA scanner (Phase 3)
--   - reassign_assignment() / previous_collector_id (Phase 4/5 — reassignment)
--   - push_subscriptions, notifications (Phase 3)
--   - sync_runs / sync_row_issues (Phase 6)

-- ---------------------------------------------------------------------
-- 1. matches
-- ---------------------------------------------------------------------
create table matches (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  home_team text not null,
  away_team text not null,
  competition text,
  match_date date not null,
  kickoff_time timestamptz,
  official_website_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index matches_match_date_idx on matches (match_date);

create trigger matches_set_updated_at
  before update on matches
  for each row
  execute function set_updated_at();

alter table matches enable row level security;

-- Read-only reference data for any signed-in user (collector or admin).
create policy matches_select on matches
  for select
  using (auth.uid() is not null);

-- No insert/update/delete policy for `authenticated`: matches are written
-- only via security-definer RPCs (this phase) or the service-role sync
-- pipeline (Phase 6). This mirrors the profiles pattern from Phase 1.

-- ---------------------------------------------------------------------
-- 2. assignment_status
-- ---------------------------------------------------------------------
-- Exactly the three Phase 2 states. Phase 3 adds 'Overdue' via
-- `alter type assignment_status add value 'Overdue'` once the SLA scanner
-- exists to set it — intentionally not added now.
create type assignment_status as enum ('Not Started', 'In Progress', 'Completed');

-- ---------------------------------------------------------------------
-- 3. assignments
-- ---------------------------------------------------------------------
create table assignments (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id) on delete cascade,
  collector_id uuid not null references profiles (id),
  raw_task_value text not null,
  task text not null,
  -- `half` is a CHECK, not an enum, on purpose: extending an enum requires
  -- ALTER TYPE ... ADD VALUE (which cannot run inside the same transaction
  -- as other DDL touching that type); a CHECK is a single trivial migration
  -- to widen later. 'Full Match' is the placeholder for future
  -- non-half-scoped assignments per the final spec.
  half text not null default 'Full Match'
    check (half in ('Half 1', 'Half 2', 'Half 3', 'Half 4', 'Full Match')),
  sla timestamptz not null,
  shift_date date,
  status assignment_status not null default 'Not Started',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assignments_logical_identity unique (match_id, task, half),
  constraint assignments_started_before_completed
    check (completed_at is null or started_at is not null),
  constraint assignments_status_timestamps check (
    (status = 'Not Started' and started_at is null and completed_at is null)
    or (status = 'In Progress' and started_at is not null and completed_at is null)
    or (status = 'Completed' and started_at is not null and completed_at is not null)
  )
);

create index assignments_collector_id_idx on assignments (collector_id);
create index assignments_status_idx on assignments (status);
create index assignments_shift_date_idx on assignments (shift_date);
-- Reused as-is by the Phase 3 SLA scanner per the final spec's stated
-- indexing plan.
create index assignments_sla_idx on assignments (sla) where status <> 'Completed';

create trigger assignments_set_updated_at
  before update on assignments
  for each row
  execute function set_updated_at();

alter table assignments enable row level security;

create policy assignments_select on assignments
  for select
  using (collector_id = auth.uid() or is_admin());

-- No insert/update/delete policy for `authenticated`: all writes go through
-- the security-definer RPCs below, each of which performs its own checks.

-- ---------------------------------------------------------------------
-- 4. start_assignment / complete_assignment
--
-- Both follow the final spec's §7 hardening template: no client-passed
-- collector id (auth.uid() only), atomic single UPDATE ... WHERE <guard>
-- RETURNING * (no separate SELECT-then-UPDATE race window), pinned
-- search_path, default-deny + explicit grant.
-- ---------------------------------------------------------------------
create or replace function start_assignment(p_assignment_id uuid)
returns assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_row assignments;
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;

  update assignments
  set status = 'In Progress',
      started_at = now(),
      updated_at = now()
  where id = p_assignment_id
    and collector_id = v_caller
    and status = 'Not Started'
  returning * into v_row;

  if not found then
    -- Covers: assignment doesn't exist, belongs to someone else, or is
    -- already In Progress/Completed — all fail the same safe way, with a
    -- typed error the client can distinguish from a network/auth failure.
    raise exception 'ASSIGNMENT_NOT_STARTABLE';
  end if;

  return v_row;
end;
$$;

revoke all on function start_assignment from public;
grant execute on function start_assignment to authenticated;

create or replace function complete_assignment(p_assignment_id uuid)
returns assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_row assignments;
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;

  update assignments
  set status = 'Completed',
      completed_at = now(),
      updated_at = now()
  where id = p_assignment_id
    and collector_id = v_caller
    and status = 'In Progress'
  returning * into v_row;

  if not found then
    raise exception 'ASSIGNMENT_NOT_COMPLETABLE';
  end if;

  return v_row;
end;
$$;

revoke all on function complete_assignment from public;
grant execute on function complete_assignment to authenticated;

-- ---------------------------------------------------------------------
-- 5. create_assignment / update_assignment_task_half
--
-- Admin-only. Pre-check (match_id, task, half) and raise a typed
-- DUPLICATE_LOGICAL_ASSIGNMENT error (with the conflicting id in DETAIL)
-- instead of ever letting a raw 23505 unique-violation reach the client.
-- The table's UNIQUE constraint remains as a defense-in-depth backstop
-- against races between the pre-check and the insert/update.
-- ---------------------------------------------------------------------
create or replace function create_assignment(
  p_match_id uuid,
  p_collector_id uuid,
  p_raw_task_value text,
  p_task text,
  p_half text,
  p_sla timestamptz,
  p_shift_date date
) returns assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role user_role;
  v_conflict_id uuid;
  v_row assignments;
begin
  select role into v_caller_role from profiles where id = auth.uid();
  if v_caller_role is distinct from 'admin' then
    raise exception 'not authorized';
  end if;

  select id into v_conflict_id
  from assignments
  where match_id = p_match_id and task = p_task and half = p_half;

  if v_conflict_id is not null then
    raise exception 'DUPLICATE_LOGICAL_ASSIGNMENT' using detail = v_conflict_id::text;
  end if;

  insert into assignments (
    match_id, collector_id, raw_task_value, task, half, sla, shift_date
  )
  values (
    p_match_id, p_collector_id, p_raw_task_value, p_task, p_half, p_sla, p_shift_date
  )
  returning * into v_row;

  return v_row;
exception
  when unique_violation then
    -- Race-condition backstop: two concurrent calls both pass the
    -- pre-check, then one hits the UNIQUE constraint at insert time.
    raise exception 'DUPLICATE_LOGICAL_ASSIGNMENT';
end;
$$;

revoke all on function create_assignment from public;
grant execute on function create_assignment to authenticated;

create or replace function update_assignment_task_half(
  p_assignment_id uuid,
  p_task text,
  p_half text,
  p_raw_task_value text
) returns assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role user_role;
  v_match_id uuid;
  v_conflict_id uuid;
  v_row assignments;
begin
  select role into v_caller_role from profiles where id = auth.uid();
  if v_caller_role is distinct from 'admin' then
    raise exception 'not authorized';
  end if;

  select match_id into v_match_id from assignments where id = p_assignment_id;
  if v_match_id is null then
    raise exception 'not found';
  end if;

  select id into v_conflict_id
  from assignments
  where match_id = v_match_id
    and task = p_task
    and half = p_half
    and id <> p_assignment_id;

  if v_conflict_id is not null then
    raise exception 'DUPLICATE_LOGICAL_ASSIGNMENT' using detail = v_conflict_id::text;
  end if;

  update assignments
  set task = p_task,
      half = p_half,
      raw_task_value = p_raw_task_value,
      updated_at = now()
  where id = p_assignment_id
  returning * into v_row;

  return v_row;
exception
  when unique_violation then
    raise exception 'DUPLICATE_LOGICAL_ASSIGNMENT';
end;
$$;

revoke all on function update_assignment_task_half from public;
grant execute on function update_assignment_task_half to authenticated;

-- ---------------------------------------------------------------------
-- 6. get_match_collaborators
--
-- Powers "other collectors working on the same match" on the assignment
-- details page without loosening `profiles` RLS: a collector may only call
-- this for a match they themselves have an assignment on; admins may call
-- it for any match.
-- ---------------------------------------------------------------------
create or replace function get_match_collaborators(p_match_id uuid)
returns table (
  assignment_id uuid,
  collector_id uuid,
  full_name text,
  task text,
  half text,
  status assignment_status
)
language sql
security definer
set search_path = public
stable
as $$
  select a.id, a.collector_id, p.full_name, a.task, a.half, a.status
  from assignments a
  join profiles p on p.id = a.collector_id
  where a.match_id = p_match_id
    and (
      is_admin()
      or exists (
        select 1 from assignments mine
        where mine.match_id = p_match_id and mine.collector_id = auth.uid()
      )
    );
$$;

revoke all on function get_match_collaborators from public;
grant execute on function get_match_collaborators to authenticated;

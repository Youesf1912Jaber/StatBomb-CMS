-- Annual leave ledger: consumption/reversal of Expected AL-R and AL-C days.
-- Annual Spare Google Sheet remains the original/base balance and is never
-- written by this table. Remaining balances are computed later as
-- Annual Spare available minus currently consumed ledger days.
--
-- Identity is (hr_code, leave_date, leave_type). Repeated Expected refreshes
-- must not insert a second consume row for the same leave day.
-- AL-R -> AL-C (and reverse) is supported because leave_type is part of the
-- unique key: the old type can be set to action = 'reverse' and the new type
-- can be consumed independently. Total Available net change stays one day.
--
-- Writes are service-role only. Authenticated clients may SELECT only.

create table annual_leave_ledger (
  id uuid primary key default gen_random_uuid(),
  hr_code text not null,
  collector_id uuid references profiles (id) on delete set null,
  leave_date date not null,
  leave_type text not null,
  source_week text,
  source_cell text,
  action text not null default 'consume',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint annual_leave_ledger_hr_code_canonical_check
    check (hr_code = upper(btrim(hr_code)) and hr_code <> ''),
  constraint annual_leave_ledger_leave_type_check
    check (leave_type in ('AL-R', 'AL-C')),
  constraint annual_leave_ledger_action_check
    check (action in ('consume', 'reverse')),
  constraint annual_leave_ledger_identity_unique
    unique (hr_code, leave_date, leave_type)
);

comment on table annual_leave_ledger is
  'Consumption ledger for Expected annual leave days. Unique on hr_code + leave_date + leave_type so refreshes cannot double-consume. Annual Spare remains the original/base balance.';

comment on column annual_leave_ledger.hr_code is
  'Canonical collector HR-Code stored trim + uppercase. Not a foreign key because Expected can contain HR-Codes that are not in profiles.';

comment on column annual_leave_ledger.collector_id is
  'Optional profiles.id when the HR-Code currently matches a profile.';

comment on column annual_leave_ledger.leave_date is
  'Calendar date of the Expected leave day being consumed or reversed.';

comment on column annual_leave_ledger.leave_type is
  'AL-R or AL-C only.';

comment on column annual_leave_ledger.source_week is
  'Expected week identity/date used by later integration. Not part of uniqueness.';

comment on column annual_leave_ledger.source_cell is
  'Expected weekday/cell identity such as Sunday. Not part of uniqueness.';

comment on column annual_leave_ledger.action is
  'consume = currently counted against Annual Spare. reverse = that leave type is no longer consumed. Same identity cannot have two rows.';

create index annual_leave_ledger_hr_code_idx
  on annual_leave_ledger (lower(hr_code));

create index annual_leave_ledger_collector_id_idx
  on annual_leave_ledger (collector_id);

create index annual_leave_ledger_leave_date_idx
  on annual_leave_ledger (leave_date);

create index annual_leave_ledger_leave_type_idx
  on annual_leave_ledger (leave_type);

create index annual_leave_ledger_source_week_idx
  on annual_leave_ledger (source_week);

create trigger annual_leave_ledger_set_updated_at
  before update on annual_leave_ledger
  for each row
  execute function set_updated_at();

alter table annual_leave_ledger enable row level security;

create policy annual_leave_ledger_select on annual_leave_ledger
  for select
  using (
    (
      hr_code <> ''
      and exists (
        select 1
        from profiles p
        where p.id = auth.uid()
          and p.hr_code is not null
          and lower(p.hr_code) = lower(annual_leave_ledger.hr_code)
      )
    )
    or is_admin()
  );

grant select on table annual_leave_ledger to authenticated;

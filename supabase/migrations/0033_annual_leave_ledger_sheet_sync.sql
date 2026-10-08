-- Annual leave ledger sheet sync status for a future Annual Spare writer.
-- Existing historical rows stay NULL and are not backfilled to pending.
-- Application code sets pending only when a leave state actually changes.

alter table annual_leave_ledger
  add column sheet_sync_status text,
  add column sheet_sync_error text,
  add column sheet_applied_at timestamptz;

alter table annual_leave_ledger
  add constraint annual_leave_ledger_sheet_sync_status_check
  check (
    sheet_sync_status is null
    or sheet_sync_status in ('pending', 'written', 'failed')
  );

comment on column annual_leave_ledger.sheet_sync_status is
  'Future sheet write tracking. NULL = historical/untracked. pending, written, and failed are set by application code. Existing rows are not backfilled.';

comment on column annual_leave_ledger.sheet_sync_error is
  'Last sheet write error when sheet_sync_status is failed. Cleared when the row is marked written or becomes pending.';

comment on column annual_leave_ledger.sheet_applied_at is
  'Timestamp of the last successful sheet write for the current leave action. Null while pending or untracked.';

create index annual_leave_ledger_sheet_sync_status_idx
  on annual_leave_ledger (sheet_sync_status);

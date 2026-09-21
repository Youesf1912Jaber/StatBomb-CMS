-- Allow the SLA scanner's Overdue status while preserving the existing
-- timestamp semantics for all other assignment statuses.

alter table public.assignments
  drop constraint assignments_status_timestamps;

alter table public.assignments
  add constraint assignments_status_timestamps check (
    (status = 'Not Started' and started_at is null and completed_at is null)
    or (status = 'In Progress' and started_at is not null and completed_at is null)
    or (status = 'Completed' and started_at is not null and completed_at is not null)
    or (status = 'Overdue' and completed_at is null)
  );

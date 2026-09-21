-- Phase 3 (SLA foundation), part 1 of 2: add the 'Overdue' assignment status.
--
-- This runs in its OWN migration file on purpose. `ALTER TYPE ... ADD VALUE`
-- commits the new enum value, and Postgres forbids *using* a newly-added enum
-- value inside the same transaction that created it. The SLA scanner function
-- that sets `status = 'Overdue'` therefore lives in the next migration
-- (0004_...), which runs as a separate transaction after this one commits.
--
-- IF NOT EXISTS keeps this migration idempotent / re-runnable.

alter type assignment_status add value if not exists 'Overdue';

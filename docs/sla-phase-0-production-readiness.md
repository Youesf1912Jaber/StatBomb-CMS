# SLA Phase 0 — Production Readiness Audit

Date: 2026-10-31
Branch: `audit/sla-phase-0-production-readiness`
Scope: Read-only inspection. No application code, database schema/data, cron jobs, secrets, or deployments were changed.

## Confirmed production facts

- Supabase project `epntwwimfiajigagjfku` is ACTIVE_HEALTHY.
- PostgreSQL is 17.6.
- Installed extensions: `pg_cron 1.6.4`, `pg_net 0.20.4`, and `supabase_vault 0.3.1`.
- The only active row in `cron.job` is job 2, scheduled `*/5 * * * *`, invoking the Match Master sync endpoint. No SLA scanner job is registered in pg_cron.
- Repository `vercel.json` on `main` is empty (`{}`). Therefore it does not declare a Vercel Cron for `/api/cron/sla-scan`.
- The SLA scanner route exists at `src/app/api/cron/sla-scan/route.ts` and calls `evaluate_assignment_sla_states()`, but the actual production scheduler for this route is not confirmed.
- Production contains `evaluate_assignment_sla_states()`, `get_sla_alert_assignments()`, and `claim_pending_push_notifications()`.
- Production `assignments` columns include `sla_warning_sent_at`, `overdue_notified_at`, `started_at`, `completed_at`, `distribution_present`, and `hidden_from_admin_dashboard`.
- No non-internal trigger on `public.assignments` currently handles SLA event reconciliation. Existing triggers only protect `distribution_present` and update `updated_at`.
- Current `evaluate_assignment_sla_states()` sends warning whenever the SLA is within one hour and warning flag is null; then separately marks incomplete assignments Overdue after SLA. It does not reset warning/overdue flags when SLA, status, or collector changes. It does not filter hidden or distribution-absent assignments.
- Current browser component `GlobalSlaAlerts.tsx` refreshes every 60 seconds, refreshes on every visibility-to-visible event, and performs a full alerts RPC after every unfiltered Postgres Changes event on `public.assignments`.
- Current client warning identity is `assignmentId:sla`; collector identity is not part of the event key.
- Assignment/notification/push-subscription tables have RLS enabled. Existing policies restrict assignment reads to assigned collector/admin and notification/push-subscription reads/updates to recipients/owners.
- Querying `pg_publication_tables` found no table entries for the `supabase_realtime` publication in the current production database. This needs confirmation before relying on Postgres Changes or Broadcast migration.
- Approximate production table stats: assignments 3,774 rows / 2.4 MB; notifications 12,850 rows / 5.65 MB; push_subscriptions 29 rows / 120 KB.
- Vercel project latest deployment is READY and targets Production, from main commit `ea59d47542a73dec4165d2a2b62caec7dc878932`. Project metadata does not establish which scheduler (if any) invokes SLA scanner.

## Important implementation blockers / decisions

1. Confirm the actual production mechanism invoking `/api/cron/sla-scan` (if any). The repository config and Supabase cron catalog do not show one.
2. Resolve migration history parity: Supabase migration history includes versions 0001–0035, then 0042, then timestamped migrations; versions 0036–0041 are absent from the database history. Compare with migration files in Git before treating this as schema drift.
3. Confirm why `supabase_realtime` currently has no listed published tables and whether the current client subscription can receive assignment changes.
4. Confirm Broadcast authorization model and RLS on `realtime.messages` before designing private topics.
5. Determine how to restore `In Progress` vs `Not Started` after Overdue. `started_at` is available, but behavior must be checked against all start/reopen paths before relying on it.
6. Determine bulk-sync write volume and the assignment update paths before adding row triggers.
7. Verify Vercel plan and cron frequency entitlement. Not exposed by the project metadata returned in this audit.
8. Validate Cairo timezone and fallback-SLA parsing against the latest production commit and existing regression tests.

## Phase 0 checklist

- [x] Create isolated audit branch from `main`.
- [x] Read-only inspect Supabase project/version/extensions.
- [x] Inspect active `pg_cron` jobs.
- [x] Inspect current SLA functions, assignment columns, and assignment triggers.
- [x] Inspect RLS policies and Realtime publication metadata.
- [x] Inspect repository SLA frontend/scanner and `vercel.json`.
- [x] Inspect Vercel project and latest Production deployment.
- [ ] Compare all repository migration files with production migration history.
- [ ] Confirm Vercel plan and the real production SLA scanner invocation source.
- [ ] Inspect all assignment write/reassignment/status-sync paths and bulk-sync frequency.
- [ ] Inspect current push delivery implementation and verify whether any sender/service worker exists in the current branch.
- [ ] Inspect Realtime Broadcast policies and test feasibility without changing production.
- [ ] Produce final Phase 0 go/no-go and implementation sequence.

## Safety

No DDL, DML, migration, secret, cron, environment-variable, or deployment changes were made. This branch contains audit documentation only.

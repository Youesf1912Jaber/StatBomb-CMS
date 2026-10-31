# SLA Phase 0 — Production Readiness Audit

Date: 2026-10-31
Branch: `audit/sla-phase-0-production-readiness`
Scope: Read-only inspection. No application code, database schema/data, cron jobs, secrets, or deployments were changed.

## Confirmed production facts

- Supabase project `epntwwimfiajigagjfku` is ACTIVE_HEALTHY.
- PostgreSQL is 17.6.
- Installed extensions: `pg_cron 1.6.4`, `pg_net 0.20.4`, and `supabase_vault 0.3.1`.
- The only active row in Supabase `cron.job` is job 2, scheduled `*/5 * * * *`, invoking the Match Master sync endpoint. No SLA scanner job is registered in Supabase pg_cron.
- Repository `vercel.json` on `main` is empty (`{}`). This is expected because the user operates the SLA scanner through external cron-job.org, not Vercel Cron.
- User-provided cron-job.org dashboard screenshot shows one enabled job named `StatBomb SLA Scanner`, targeting `https://stat-bomb-cms.vercel.app/api/cron/sla-scan`; next execution appears one minute later, and the five visible recent executions are Successful (HTTP 200). This establishes the external scheduler is configured and recently succeeding, based on the screenshot; it does not independently prove long-term uptime or inspect its hidden job settings.
- The SLA scanner route exists at `src/app/api/cron/sla-scan/route.ts` and calls `evaluate_assignment_sla_states()`.
- Production contains `evaluate_assignment_sla_states()`, `get_sla_alert_assignments()`, and `claim_pending_push_notifications()`.
- Production `assignments` columns include `sla_warning_sent_at`, `overdue_notified_at`, `started_at`, `completed_at`, `distribution_present`, and `hidden_from_admin_dashboard`.
- No non-internal trigger on `public.assignments` currently handles SLA event reconciliation. Existing triggers only protect `distribution_present` and update `updated_at`.
- Current `evaluate_assignment_sla_states()` sends warning whenever the SLA is within one hour and warning flag is null; then separately marks incomplete assignments Overdue after SLA. It does not reset warning/overdue flags when SLA, status, or collector changes. It does not filter hidden or distribution-absent assignments.
- Current browser component `GlobalSlaAlerts.tsx` refreshes every 60 seconds, refreshes on every visibility-to-visible event, and performs a full alerts RPC after every unfiltered Postgres Changes event on `public.assignments`.
- Current client warning identity is `assignmentId:sla`; collector identity is not part of the event key.
- Assignment/notification/push-subscription tables have RLS enabled. Existing policies restrict assignment reads to assigned collector/admin and notification/push-subscription reads/updates to recipients/owners.
- Querying `pg_publication_tables` found no table entries for the `supabase_realtime` publication in the current production database. This needs confirmation before relying on Postgres Changes or Broadcast migration.
- Approximate production table stats: assignments 3,774 rows / 2.4 MB; notifications 12,850 rows / 5.65 MB; push_subscriptions 29 rows / 120 KB.
- Vercel project latest deployment is READY and targets Production, from main commit `ea59d47542a73dec4165d2a2b62caec7dc878932`.

## Important implementation blockers / decisions

1. External scheduler is identified as cron-job.org from the user-provided screenshot. Before changing scheduling, inspect the job's full settings (timezone, exact interval, enabled state, retry/timeout behavior, request headers/authentication, and execution history). Do not add a competing Vercel or Supabase SLA cron.
2. Resolve migration history parity: Supabase migration history includes versions 0001–0035, then 0042, then timestamped migrations; versions 0036–0041 are absent from the database history. Compare with migration files in Git before treating this as schema drift.
3. Confirm why `supabase_realtime` currently has no listed published tables and whether the current client subscription can receive assignment changes.
4. Confirm Broadcast authorization model and RLS on `realtime.messages` before designing private topics.
5. Determine how to restore `In Progress` vs `Not Started` after Overdue. `started_at` is available, but behavior must be checked against all start/reopen paths before relying on it.
6. Determine bulk-sync write volume and the assignment update paths before adding row triggers.
7. Verify external cron-job.org request authentication and avoid exposing any secret/token in screenshots, logs, or documentation.
8. Validate Cairo timezone and fallback-SLA parsing against the latest production commit and existing regression tests.

## Phase 0 checklist

- [x] Create isolated audit branch from `main`.
- [x] Read-only inspect Supabase project/version/extensions.
- [x] Inspect active Supabase `pg_cron` jobs.
- [x] Identify external SLA scheduler from user-provided cron-job.org screenshot; visible recent executions show HTTP 200.
- [x] Inspect current SLA functions, assignment columns, and assignment triggers.
- [x] Inspect RLS policies and Realtime publication metadata.
- [x] Inspect repository SLA frontend/scanner and `vercel.json`.
- [x] Inspect Vercel project and latest Production deployment.
- [ ] Inspect full cron-job.org job settings, timezone, authentication, and longer execution history (user may need to provide the job details view; do not request or expose secrets).
- [ ] Compare all repository migration files with production migration history.
- [ ] Inspect all assignment write/reassignment/status-sync paths and bulk-sync frequency.
- [ ] Inspect current push delivery implementation and verify whether any sender/service worker exists in the current branch.
- [ ] Inspect Realtime Broadcast policies and test feasibility without changing production.
- [ ] Produce final Phase 0 go/no-go and implementation sequence.

## Safety

No DDL, DML, migration, secret, cron, environment-variable, or deployment changes were made. This branch contains audit documentation only.

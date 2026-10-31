# SLA Phase 0 — Production Readiness Audit

Date: 2026-10-31
Branch: `audit/sla-phase-0-production-readiness`
Scope: Read-only inspection. No application code, database schema/data, cron jobs, secrets, or deployments were changed.

## Confirmed production facts

### Scheduler and scanner
- Production SLA scanner endpoint: `/api/cron/sla-scan`.
- User-provided cron-job.org dashboard screenshot shows one enabled job named `StatBomb SLA Scanner`, targeting `https://stat-bomb-cms.vercel.app/api/cron/sla-scan`; next execution appears one minute later, and the five visible recent executions are Successful (HTTP 200). This confirms configuration and recent success as visible in the screenshot, not full historical uptime or hidden job settings.
- The scanner route requires `CRON_SECRET` and accepts it through `Authorization: Bearer` or `x-cron-secret`; it fails closed with 401 when missing/incorrect. The cron-job.org job must send one of those headers.
- Empty `vercel.json` is expected because the user uses cron-job.org, not Vercel Cron. Do not add a competing scheduler.
- Supabase `cron.job` contains only the Match Master refresh job (job 2, `*/5 * * * *`). There is no SLA job in Supabase pg_cron.
- Recent Match Master pg_cron history shows successful five-minute runs. This does not provide cron-job.org history.
- Supabase project is ACTIVE_HEALTHY; PostgreSQL 17.6; `pg_cron 1.6.4`, `pg_net 0.20.4`, `supabase_vault 0.3.1`.
- pg_cron upstream 1.5+ supports interval schedules such as `'15 seconds'`; installed 1.6.4 is new enough at the extension level. However, no test job was created, so Supabase-hosted runtime/plan behavior and operational suitability have not been verified. Existing SLA cadence remains external cron-job.org at about one minute.

### Current SLA implementation
- Production contains `evaluate_assignment_sla_states()`, `get_sla_alert_assignments()`, and `claim_pending_push_notifications()`.
- Production `assignments` includes `sla_warning_sent_at`, `overdue_notified_at`, `started_at`, `completed_at`, `distribution_present`, and `hidden_from_admin_dashboard`.
- No non-internal trigger on `public.assignments` currently handles SLA event reconciliation.
- Current scanner marks warning when SLA is within one hour and warning flag is null; it marks incomplete assignments Overdue after SLA. It does not reset flags after SLA/collector/status changes and does not filter hidden or distribution-absent assignments.
- `GlobalSlaAlerts.tsx` refreshes every 60 seconds, on every visibility-to-visible event, and after every unfiltered Postgres Changes event on `public.assignments`.
- Client warning identity is `assignmentId:sla`; collector identity is not part of the event key.

### Realtime and push
- The `supabase_realtime` publication exists but currently has no published application tables such as `public.assignments`. Thus the current Postgres Changes subscription to assignments is not supported by the current publication membership, and its effectiveness needs a controlled test after publication configuration is understood.
- A separate internal publication named `supabase_realtime_messages_publication` contains partitioned `realtime.messages_*` tables. This is not the same as publishing `public.assignments` for Postgres Changes.
- `realtime.messages` has RLS enabled, but the current catalog query found no policies on it. Private Broadcast topic authorization is therefore not ready to be assumed; design and test topic policies before using private channels.
- Push database scaffolding exists: `push_subscriptions`, `notifications.pushed_at`, `push_claimed_at`, and `claim_pending_push_notifications()`. However repository search and `package.json` show no `web-push` package, service worker, `navigator.serviceWorker` registration, or sender route. Web Push delivery is not implemented in the audited branch.
- Assignment, notification, and push-subscription tables have RLS enabled; existing policies restrict assignment reads to assigned collector/admin and notification/push-subscription access to recipients/owners.

### Assignment write paths and bulk sync
- Distribution refresh endpoint `/api/admin/distribution/refresh` runs `reconcileDistributionAssignments()`.
- Google Sheets sync endpoint `/api/sync/run` reads the Distribution sheet, loads assignment context, and reconciles presence through `reconcile_distribution_presence()`.
- Distribution apply endpoint `/api/admin/distribution/apply` can create assignments and reconcile presence.
- Match-specific Distribution endpoint `/api/matches/[matchId]/distribution` reconciles current rows and writes assignments.
- Admin delete-row endpoint `/api/admin/distribution-row` marks `distribution_present=false`.
- Assignment status sync from Distribution performs direct per-assignment updates using the service-role client; assignment reassignment uses `reassign_assignment()`; start/complete use their own RPCs.
- Reconciliation fetches assignments in pages of 1,000, and can update/create/restore many rows in one refresh. Exact writes per run and run frequency have not yet been measured from logs. A row trigger must be tested against full refresh/bulk sync, not only single-row UI edits.
- `started_at` is set when work starts and cleared for Not Started sync/reset paths; it can help restore In Progress vs Not Started, but all reset/reassignment/reconciliation semantics must be tested before treating it as the sole source of truth.

### SLA and Cairo timezone parsing
- `parseDistributionSla()` converts Cairo civil time to UTC using `Intl.DateTimeFormat({ timeZone: 'Africa/Cairo' })`, including the timezone offset applicable to the target date.
- The assignment planner explicitly fills an empty SLA with 23:59:59 on the shift date (or match date fallback), converted using the same Cairo timezone conversion.
- Existing tests cover Cairo DST transition on 2026-10-31, explicit timestamps, time-only values, ambiguous US-style dates, and invalid values. There is no explicit test asserting the blank-SLA fallback equals 23:59:59 Cairo time or that its one-hour warning is generated. Add that regression test during implementation.
- Important nuance: malformed non-empty SLA values are rejected; only a truly blank value gets the 23:59:59 fallback.

### Migration parity and schema drift
- All repository migration files and production migration history were compared.
- Versions 0036–0041 are absent from both the current repository migration directory and Production history; this is not, by itself, a missing-migration gap.
- Repository has two files with version prefix `0028`: `0028_deductions.sql` and `0028_restore_removed_assignment_on_redistribution.sql`. Production history has only one applied `0028`, named `deductions`.
- Production `create_assignment()` currently has the old behavior: it rejects an existing logical assignment and does not restore a row whose `distribution_present=false`. The repository's `0028_restore_removed_assignment_on_redistribution.sql` contains restore behavior but does not have a separately represented applied migration version in Production history. This is a confirmed migration/schema drift candidate that needs reconciliation before any new migrations are applied.
- Several timestamped migration filenames do not match the applied history version/name exactly. Examples: repository `20261026193000_allow_start_unstarted_overdue_assignments.sql` vs applied version `20261026161259`; repository `20261029202900_get_sla_alert_assignments_rpc.sql` vs applied version `20261029175551`; repository `20261030150000_add_match_master_sync_lock.sql` while Production history contains `20261030134217` and `20261030134954`. Names and live function definitions must be reconciled migration-by-migration rather than assuming filenames are exact history versions.
- Production function `reconcile_distribution_presence()` exists and updates `distribution_present` in bulk.

### Production scale snapshot
- Approximate table stats: assignments 3,774 rows / 2.4 MB; notifications 12,850 rows / 5.65 MB; push_subscriptions 29 rows / 120 KB.
- Latest inspected Vercel Production deployment is READY, from main commit `ea59d47542a73dec4165d2a2b62caec7dc878932`.

## Important implementation blockers / decisions

1. Obtain cron-job.org job Details view to confirm exact interval, timezone, request method, auth header presence, timeout/retry settings, and longer execution history. Do not expose any token/secret.
2. Reconcile the duplicate `0028` migration and timestamped migration history vs live Production functions before creating/applying any new migrations. Do not blindly replay or mark migrations applied.
3. Decide the intended Postgres Changes vs Broadcast path. `public.assignments` is not in `supabase_realtime`; `realtime.messages` has RLS but no current policies. Broadcast needs a deliberate private-topic authorization model.
4. Confirm all assignment write paths and measure actual Distribution refresh row writes/run frequency; test trigger overhead with a production-sized staging dataset.
5. Decide reliable restoration of `In Progress` vs `Not Started` after Overdue; `started_at` is a candidate, not yet approved as sole truth.
6. Implementing Web Push requires service worker, subscription UI, sender route, pinned dependency, VAPID configuration, retries, and expired-subscription cleanup; current repo only has database scaffolding.
7. Confirm cron-job.org sends `CRON_SECRET` using an accepted header. Never paste the secret into the audit document or chat.
8. Add a regression test for blank SLA fallback at 23:59:59 Cairo and its warning timing; verify DST boundary cases.
9. Although pg_cron 1.6.4 supports seconds intervals upstream, do not switch schedulers or assume 15-second production cadence until Supabase runtime/plan behavior and load are verified.

## Phase 0 checklist

- [x] Create isolated audit branch from `main`.
- [x] Read-only inspect Supabase project/version/extensions.
- [x] Inspect active Supabase `pg_cron` jobs and recent DB cron runs.
- [x] Identify external SLA scheduler from user screenshot; visible recent executions show HTTP 200.
- [x] Inspect scanner authentication contract (`CRON_SECRET` via Bearer or `x-cron-secret`).
- [x] Inspect current SLA functions, assignment columns, and assignment triggers.
- [x] Inspect RLS policies and Realtime publication metadata.
- [x] Inspect repository SLA frontend/scanner and `vercel.json`.
- [x] Inspect Vercel project and latest Production deployment.
- [x] Compare repository migration directory with Production migration history; identify duplicate 0028 and version/name drift candidates.
- [x] Identify assignment mutation/reconciliation endpoints and direct status update paths.
- [x] Check repository for push sender, web-push dependency, and service worker; none found.
- [x] Inspect Cairo timezone parser and blank-SLA fallback implementation.
- [ ] Inspect full cron-job.org job settings, timezone, auth header presence, retries, and longer execution history.
- [ ] Measure actual assignment writes and Distribution refresh frequency from available application logs.
- [ ] Reconcile all migration files with live Production function/schema definitions, especially duplicate 0028 and timestamped migrations.
- [ ] Validate Broadcast private-topic design and RLS; no production changes.
- [ ] Add/plan fallback-SLA and DST regression tests.
- [ ] Validate pg_cron sub-minute runtime behavior or retain the external one-minute scheduler.
- [ ] Produce final Phase 0 go/no-go and implementation sequence.

## Safety

No DDL, DML, migration, secret, cron, environment-variable, or deployment changes were made. This branch contains audit documentation only.

# SLA Phase 0 — Production Readiness Audit

Date: 2026-10-31
Branch: `audit/sla-phase-0-production-readiness`
Scope: Read-only inspection. No application code, database schema/data, cron jobs, secrets, or deployments were changed.

## Confirmed production facts

### Scheduler and scanner
- Production SLA scanner endpoint: `/api/cron/sla-scan`.
- User-provided cron-job.org configuration screenshots confirm one enabled job named `StatBomb SLA Scanner`, targeting `https://stat-bomb-cms.vercel.app/api/cron/sla-scan`.
- Confirmed schedule: every 1 minute; job timezone: `Africa/Cairo`. The five upcoming executions shown are spaced one minute apart in Cairo local time.
- Confirmed request settings: HTTP `GET`; timeout 30 seconds; request body empty; HTTP Basic authentication disabled; custom header key is `x-cron-secret`. User explicitly confirmed that its configured value is the same as Production's `CRON_SECRET`; no secret value was shared. Authentication configuration is therefore confirmed.
- Confirmed advanced behavior: redirects with HTTP 3xx are not treated as success; schedule expiration is disabled; response saving in job history is disabled; failure notification is disabled; success-after-failure notification is disabled; automatic job disabling after too many failures is enabled; notification channel setting is "all notification channels" but no failure/success event notifications are enabled in the screenshot.
- The earlier dashboard screenshot showed five recent executions as Successful (HTTP 200). This plus the current settings confirms recent operation, not long-term uptime.
- Vercel Production runtime logs are retained for only the latest 1 hour on the current plan; a 24-hour Vercel runtime-log request was rejected by the API because the plan does not retain that range. The available 50-minute sample shows the scheduled scanner executing approximately once per minute with successful completion logs. One separate request at 18:40:18 UTC was rejected as unauthorized, while the scheduled invocation at 18:40:01 UTC succeeded; this looks like an extra invalid request, not a missed scheduled run.
- In the available 50-minute sample, successful scanner durations ranged roughly 0.18–1.89 seconds, with no RPC failure shown. The log sample includes one scan that fired 3 warnings and 3 overdue transitions; most sampled runs fired zero.

- The scanner route requires `CRON_SECRET` and accepts it through `Authorization: Bearer` or `x-cron-secret`; the user confirmed the configured `x-cron-secret` value matches Production `CRON_SECRET`.
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
- Supabase unified logs for the available rolling ~24-hour window show 10,542 calls to `get_sla_alert_assignments` (average 102 ms, p95 296 ms, max 2.8 s; zero non-2xx). This endpoint volume is far above one request/minute and indicates many active browser refreshes/sessions. The observed count averages about 12.3 requests/minute during the ~14.2-hour interval where this endpoint was active.
- The same log window shows 1,435 calls to `evaluate_assignment_sla_states` (average 524 ms, p95 1.16 s, max 3.39 s; zero non-2xx), consistent with approximately one scheduled scan per minute across the 24-hour retained window.
- Realtime logs show 74 events stating "Stopping Postgres Changes streaming for tenant due to no active subscriptions". No assignment table is published to `supabase_realtime`, so these logs do not establish successful assignment change delivery.

- Client warning identity is `assignmentId:sla`; collector identity is not part of the event key.

### Realtime and in-app alarm
### Direct Production verification of Realtime and assignment triggers
- A fresh read-only catalog query confirms the `supabase_realtime` publication currently contains no application tables; the separate `supabase_realtime_messages_publication` contains only partitioned `realtime.messages_*` tables.
- A fresh query of policies on `realtime.messages` returned no policies. Private Broadcast authorization is not yet in place; do not switch the client to private Broadcast until topic authorization and role/assignment scoping are designed and tested.
- A fresh query confirms `public.assignments` has only two non-internal triggers: `assignments_protect_distribution_present` and `assignments_set_updated_at`. There is no SLA-event reconciliation trigger today.
- These findings reinforce that the existing `postgres_changes` subscription in the browser cannot be assumed to receive assignment changes with the current publication membership.

- `GlobalSlaAlerts.tsx` implements the in-site alarm: fixed-position SLA cards, looping `/sounds/sla-warning.wav`, explicit sound-enable interaction for autoplay restrictions, per-alert Stop behavior, and localStorage silencing keyed by warning event ID.
- It currently refreshes alert assignments every 60 seconds, on tab visibility becoming visible, and after every matching `postgres_changes` event. Current publication membership does not support that assignment subscription, so the realtime callback is not a dependable delivery path today.
- Audio ownership is coordinated across tabs with a localStorage lease (15-second TTL, renewed every 7.5 seconds), reducing duplicate audio across tabs; add coverage for lease expiry/races.
- This is a page-based alarm, not a background notification. With the site closed no in-app alarm can render; if audio is blocked/not unlocked, the card may render silently until the user enables sound.
- Stop Alarm silences one warning event in that browser's localStorage/session state; it does not change the assignment or globally acknowledge the warning on other devices. Confirm whether this is intended.
- Warning identity currently uses `assignmentId:sla`; collector identity is not included. On reassignment, the new collector could inherit an old local silencing key. Decide whether the event identity should include collector ID as part of the reassignment behavior.
- The `supabase_realtime` publication exists but currently has no published application tables such as `public.assignments`. Thus the current Postgres Changes subscription to assignments is not supported by the current publication membership, and its effectiveness needs a controlled test after publication configuration is understood.
- A separate internal publication named `supabase_realtime_messages_publication` contains partitioned `realtime.messages_*` tables. This is not the same as publishing `public.assignments` for Postgres Changes.
- `realtime.messages` has RLS enabled, but the current catalog query found no policies on it. Private Broadcast topic authorization is therefore not ready to be assumed; design and test topic policies before using private channels.
- **Web Push and browser notifications are explicitly out of scope.** The user confirmed that the product intentionally relies on the in-site In-App SLA Alarm, not operating-system/browser push notifications. The absence of a `web-push` package, service worker, or sender route is therefore not a blocker and must not trigger implementation work. Existing push-related database scaffolding (if retained) is legacy/unused for this feature unless separately audited; do not build on it or add VAPID configuration.
- The accepted UX reference is the user-provided screenshot: an in-site `SLA WARNING` panel showing match, competition, assignment, task, deadline, remaining-time badge (for example `1 HOUR LEFT`), audible alarm, and a `Stop Alarm` action. Phase 1 must preserve this in-app experience and improve its event delivery/reliability rather than replace it with browser notifications.
- The in-app alarm still depends on the page being open and its client runtime/audio being active. Confirm the intended behavior for multiple simultaneous warnings, tab visibility/backgrounding, audio permission/autoplay restrictions, stopping one alarm vs all alarms, and avoiding duplicate/replayed alarms.
- Assignment, notification, and push-subscription tables have RLS enabled; existing policies restrict assignment reads to assigned collector/admin and notification/push-subscription access to recipients/owners.

### Assignment write paths and bulk sync
- Distribution refresh endpoint `/api/admin/distribution/refresh` runs `reconcileDistributionAssignments()`.
- Google Sheets sync endpoint `/api/sync/run` reads the Distribution sheet, loads assignment context, and reconciles presence through `reconcile_distribution_presence()`.
- Distribution apply endpoint `/api/admin/distribution/apply` can create assignments and reconcile presence.
- Match-specific Distribution endpoint `/api/matches/[matchId]/distribution` reconciles current rows and writes assignments.
- Admin delete-row endpoint `/api/admin/distribution-row` marks `distribution_present=false`.
- Assignment status sync from Distribution performs direct per-assignment updates using the service-role client; assignment reassignment uses `reassign_assignment()`; start/complete use their own RPCs.
- Supabase API logs in the available rolling ~24-hour window show 50 calls to `reconcile_distribution_presence` (average 299 ms, p95 548 ms, max 619 ms; 0 non-2xx), 35 calls to `create_assignment` (1 non-2xx), and 4 calls to `reassign_assignment`. This provides observed RPC frequency but **not exact assignment row-write counts**.
- PostgreSQL logs do not contain successful per-statement DML/query records in the retained sample; they mainly expose checkpoint/cron lifecycle plus three logged SQL errors. Therefore actual assignment rows written per reconciliation run cannot be derived from current logs. A controlled staging run with instrumentation or an audited sync-run counter is required.
- Reconciliation fetches assignments in pages of 1,000, and can update/create/restore many rows in one refresh. A row trigger must be tested against full refresh/bulk sync, not only single-row UI edits.
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
- The restore migration updates collector/status/timestamps when the collector changes, but does **not** reset `sla_warning_sent_at` or `overdue_notified_at` when restoring/reassigning the preserved row. Under the approved SLA decisions, that could suppress a fresh warning/Overdue event for the new collector. Do not apply this file verbatim; its behavior needs a follow-up design and tests.
- Production has the unique logical identity constraint/index on `(match_id, task, half)`, confirming why restoration of the existing row is needed instead of inserting a duplicate.

- Several timestamped migration filenames do not match the applied history version/name exactly. Examples: repository `20261026193000_allow_start_unstarted_overdue_assignments.sql` vs applied version `20261026161259`; repository `20261029202900_get_sla_alert_assignments_rpc.sql` vs applied version `20261029175551`; repository `20261030150000_add_match_master_sync_lock.sql` while Production history contains `20261030134217` and `20261030134954`. Names and live function definitions must be reconciled migration-by-migration rather than assuming filenames are exact history versions.
- Production function `reconcile_distribution_presence()` exists and updates `distribution_present` in bulk.

### Production log measurements and advisor review
- Available Supabase unified log sample (rolling ~24 hours as returned by the log service): `edge_logs` 28,821 entries, `auth_logs` 4,536, `postgres_logs` 1,160, `auth_audit_logs` 347, `realtime_logs` 121, `pgbouncer_logs` 88, `postgrest_logs` 14, `storage_logs` 6, and `workflow_run_logs` 6.
- Relevant endpoint counts and latency percentiles are recorded above. These are request counts, not assignment row mutation counts.
- Supabase Performance Advisor reported 33 unused-index notices and one duplicate-index warning (`sync_runs_created_at_desc_idx` and `sync_runs_created_at_idx`). Do not drop indexes during this SLA phase; several may be newly introduced or workload-dependent.
- Supabase Security Advisor reported: 3 RLS-enabled internal Match Master tables without policies; catalog grants confirm `anon` and `authenticated` have no table privileges and `service_role` does, so this appears intentionally service-role-only. It also reports mutable search_path warnings for 3 functions and SECURITY DEFINER execute grants exposed to anon/authenticated across multiple RPCs (20 anon findings and 21 authenticated findings in the returned summary). These need a separate function-by-function authorization review; do not blanket-revoke because application RPCs may intentionally be callable by signed-in users and may perform internal authorization checks.
- Performance Advisor also reports RLS policies repeatedly evaluating auth/current_setting functions on several tables including `assignments`, `profiles`, `matches`, `notifications`, and task timers; this is an optimization candidate, not a reason to change policies without validating semantics.

### Production scale snapshot
- Approximate table stats: assignments 3,774 rows / 2.4 MB; notifications 12,850 rows / 5.65 MB; push_subscriptions 29 rows / 120 KB.
- Latest inspected Vercel Production deployment is READY, from main commit `ea59d47542a73dec4165d2a2b62caec7dc878932`.

## Important implementation blockers / decisions

1. Scheduler settings and authentication are confirmed by the user: every minute in Africa/Cairo, GET, 30-second timeout, and `x-cron-secret` matches Production `CRON_SECRET`. Remaining scheduler check: inspect longer execution history / retry policy.
2. Reconcile the duplicate `0028` migration and timestamped migration history vs live Production functions before creating/applying any new migrations. Do not blindly replay or mark migrations applied.
3. Decide the intended Postgres Changes vs Broadcast path. `public.assignments` is not in `supabase_realtime`; `realtime.messages` has RLS but no current policies. Broadcast needs a deliberate private-topic authorization model.
4. Confirm all assignment write paths and measure actual Distribution refresh row writes/run frequency; test trigger overhead with a production-sized staging dataset.
5. Decide reliable restoration of `In Progress` vs `Not Started` after Overdue; `started_at` is a candidate, not yet approved as sole truth.
6. Web Push/browser notifications are explicitly excluded. Keep the existing In-App SLA Alarm UX (warning panel + sound + Stop Alarm) as the only supported notification surface for this scope; audit and harden its delivery, deduplication, lifecycle, and audio behavior.
7. Authentication confirmed by user: configured `x-cron-secret` value matches deployed `CRON_SECRET`. Secret was not disclosed.
8. Add a regression test for blank SLA fallback at 23:59:59 Cairo and its warning timing; verify DST boundary cases.
9. Although pg_cron 1.6.4 supports seconds intervals upstream, do not switch schedulers or assume 15-second production cadence until Supabase runtime/plan behavior and load are verified.


## Confirmed product decisions for the SLA redesign

- Notification surface: **in-app alarm only**. Do not implement Web Push, browser notification popups, service-worker push delivery, or VAPID setup as part of this work.
- Preserve the current visual/interaction contract shown in the supplied screenshot: `SLA WARNING` panel, match/competition/assignment/task/deadline details, remaining-time indicator, audible alarm, and `Stop Alarm` control.
- If an assignment is currently Overdue and its SLA moves into the future, restore its status to `In Progress` when work has started, otherwise `Not Started`.
- If the scanner resumes after an outage and both warning time and SLA have already passed, emit Overdue only; do not emit a stale one-hour warning.
- If an assignment is reassigned to a new collector within the last hour before SLA, send the new collector an immediate warning.
- If SLA is blank and the established fallback is 23:59:59 Cairo time, the one-hour warning must be scheduled relative to that fallback.
- If an assignment is hidden from the Admin dashboard or removed from the Distribution sheet, cancel its pending alerts.

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
- [x] Confirm user decision: Web Push/browser notifications are out of scope; in-site SLA Alarm is the required notification experience.
- [x] Record the supplied In-App SLA Alarm screenshot as the UX reference (warning details, one-hour badge, audible alarm, Stop Alarm control).
- [x] Inspect Cairo timezone parser and blank-SLA fallback implementation.
- [x] Inspect cron-job.org schedule, timezone, request method, timeout, and configured auth header name.
- [x] User confirmed `x-cron-secret` value matches Production `CRON_SECRET`.
- [ ] Inspect longer cron-job.org execution history and retry behavior (Vercel log retention is only 1 hour on current plan; scheduler history still needed).
- [x] Measure available Distribution/SLA RPC request counts and latency from Supabase logs.
- [ ] Measure exact assignment row writes per reconciliation run; current logs do not expose successful DML row counts.
- [x] Directly compare Production migration history and live definitions for `create_assignment`, `start_assignment`, `get_sla_alert_assignments`, and Match Master lock functions.
- [x] Confirm three timestamp/name differences are already applied and must not be replayed.
- [x] Review the missing `create_assignment()` restore SQL against Production logical-identity constraint and SLA fields; identified missing reset of SLA notification flags as a blocker to applying it verbatim.
- [ ] Design and test a corrected restore migration against RLS, reconciliation paths, and approved SLA behavior.
- [x] Recheck Production Realtime publication membership, realtime.messages policies, and assignment triggers; findings recorded above.
- [ ] Design and validate Broadcast/private-topic authorization for targeted in-app alarm updates; no production changes.
- [x] Verify Match Master internal tables with no RLS policies have no anon/authenticated table grants; service_role-only access is configured.
- [x] Audit current in-app alarm client behavior: 60-second refresh, visibility refresh, current Realtime listener, looping audio, explicit audio unlock, per-event Stop, localStorage silencing, and cross-tab audio lease.
- [ ] Test/decide alarm lifecycle semantics: reassignment identity, Stop behavior across devices/tabs, simultaneous warnings, missed-event recovery, and inactive/background tabs.
- [ ] Add/plan fallback-SLA and DST regression tests.
- [x] Verify external cron-job.org scanner runs about once per minute in the available 50-minute Vercel log sample; keep external scheduler for now.
- [ ] Inspect longer scheduler history/retry settings before final scheduler reliability sign-off.
- [ ] Produce final Phase 0 go/no-go and implementation sequence.

## Safety

No DDL, DML, migration, secret, cron, environment-variable, or deployment changes were made. This branch contains audit documentation only.

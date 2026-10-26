create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid)
from cron.job
where jobname = 'match-master-cache-refresh';

select cron.schedule(
  'match-master-cache-refresh',
  '*/5 * * * *',
  $job$
    select net.http_get(
      url := 'https://stat-bomb-cms-yousefabdelgaberarqam-ux.vercel.app/api/cron/match-master-sync',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'match_master_cron_secret'),
        'Content-Type',
        'application/json'
      ),
      timeout_milliseconds := 10000
    );
  $job$
);

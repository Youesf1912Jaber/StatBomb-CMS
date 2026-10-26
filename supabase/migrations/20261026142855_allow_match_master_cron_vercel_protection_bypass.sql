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
        'x-vercel-' || 'protection-bypass',
        (select decrypted_secret from vault.decrypted_secrets where name = 'match_master_vercel_bypass'),
        'Content-Type',
        'application/json'
      ),
      timeout_milliseconds := 60000
    );
  $job$
);

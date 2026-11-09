-- Automatische Bereinigung alle 5 Minuten über pg_cron (im Gratis-Tarif verfügbar)
create extension if not exists pg_cron with schema pg_catalog;

select cron.unschedule(jobid) from cron.job where jobname = 'constellaboard-cleanup';
select cron.schedule('constellaboard-cleanup', '*/5 * * * *', $$ select private.cleanup_expired_sessions(); $$);

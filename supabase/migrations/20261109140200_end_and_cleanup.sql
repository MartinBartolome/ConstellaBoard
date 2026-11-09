-- Sitzungsende und automatische Bereinigung (enthält bewusst Löschbefehle)

-- ---------------------------------------------------------------------
-- Sitzung beenden: löscht alle Inhalte und Zugänge in einer Transaktion.
-- Anonyme Auth-Konten der Teilnehmenden werden ebenfalls gelöscht.
-- ---------------------------------------------------------------------
create or replace function private.end_session(p_session_id text, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uids uuid[];
begin
  -- 1. Schreibzugriffe sperren (Status zuerst, sperrt Realtime und Funktionen)
  update public.sessions
     set status = 'ended', ended_at = now(), end_reason = p_reason,
         access_code_hash = null, access_code_salt = null
   where id = p_session_id and status = 'active';
  if not found then
    return false;
  end if;

  select coalesce(array_agg(auth_uid), '{}') into v_uids
    from public.participants where session_id = p_session_id;

  -- 3. Zugangstoken widerrufen (löschen)
  delete from public.session_tokens where session_id = p_session_id;
  -- 4. Brettzustand löschen
  delete from public.board_states where session_id = p_session_id;
  -- 5. Temporäre Teilnehmerdaten löschen
  delete from public.participants where session_id = p_session_id;
  -- Anonyme Konten entfernen, sofern sie in keiner anderen aktiven Sitzung sind
  delete from auth.users u
   where u.id = any (v_uids)
     and u.is_anonymous
     and not exists (select 1 from public.participants p where p.auth_uid = u.id);
  -- Nachrichten-Historie des Kanals (falls von Realtime gespeichert) entfernen
  delete from realtime.messages
   where topic in ('session:' || p_session_id, 'session:' || p_session_id || ':ops');
  return true;
end;
$$;

create or replace function public.end_session(p_session_id text, p_reason text default 'closed')
returns boolean
language sql
security definer
set search_path = ''
as $$ select private.end_session(p_session_id, p_reason) $$;
revoke execute on function public.end_session(text, text) from public, anon, authenticated;
grant execute on function public.end_session(text, text) to service_role;

-- ---------------------------------------------------------------------
-- Automatische Bereinigung
-- ---------------------------------------------------------------------
create or replace function private.cleanup_expired_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select id,
           case when expires_at <= now() then 'expired' else 'inactive' end as reason
      from public.sessions
     where status = 'active'
       and (expires_at <= now()
            or last_activity_at <= now() - make_interval(mins => inactivity_minutes))
  loop
    if private.end_session(r.id, r.reason) then
      n := n + 1;
    end if;
  end loop;

  -- Beendete Sitzungshüllen nach 7 Tagen vollständig entfernen
  delete from public.sessions where status = 'ended' and ended_at < now() - interval '7 days';
  -- Alte Rate-Limit-Fenster entfernen
  delete from private.rate_limits where window_start < now() - interval '1 hour';
  -- Verwaiste anonyme Konten (z. B. abgebrochene Beitritte) nach 1 Tag entfernen
  delete from auth.users u
   where u.is_anonymous
     and u.created_at < now() - interval '1 day'
     and not exists (select 1 from public.participants p where p.auth_uid = u.id);
  return n;
end;
$$;

create or replace function public.cleanup_expired_sessions()
returns integer
language sql
security definer
set search_path = ''
as $$ select private.cleanup_expired_sessions() $$;
revoke execute on function public.cleanup_expired_sessions() from public, anon, authenticated;
grant execute on function public.cleanup_expired_sessions() to service_role;

revoke execute on function private.end_session(text, text) from public, anon, authenticated;
revoke execute on function private.cleanup_expired_sessions() from public, anon, authenticated;
revoke execute on function private.rate_limit_hit(text, integer, integer) from public, anon, authenticated;

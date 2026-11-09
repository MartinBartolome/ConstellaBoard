-- Zugriffsregeln: keine direkten Rechte für Browser, Realtime-Autorisierung
revoke all on schema private from public, anon, authenticated;

-- Keine direkten Rechte für Browser-Rollen
revoke all on public.sessions, public.session_tokens, public.participants, public.board_states from anon, authenticated;
revoke all on private.rate_limits from anon, authenticated;

-- ---------------------------------------------------------------------
-- Rate-Limiting (atomar). Gibt true zurück, wenn die Anfrage erlaubt ist.
-- ---------------------------------------------------------------------
create or replace function private.rate_limit_hit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into private.rate_limits as r (bucket, window_start, hits)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;

-- Öffentliche Hülle, nur für die Service-Role (Edge Functions) aufrufbar
create or replace function public.rate_limit_hit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language sql
security definer
set search_path = ''
as $$ select private.rate_limit_hit(p_bucket, p_limit, p_window_seconds) $$;
revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- ---------------------------------------------------------------------
-- Realtime-Autorisierung
-- Kanäle:  session:<id>       Anwesenheit, Cursor, Steuerung (alle Teilnehmenden)
--          session:<id>:ops   Brettänderungen (nur mit Bearbeitungsrecht senden)
-- ---------------------------------------------------------------------
create or replace function private.session_member(p_topic text, p_require_edit boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.participants p
    join public.sessions s on s.id = p.session_id
    where p.auth_uid = (select auth.uid())
      and p.revoked_at is null
      and s.status = 'active'
      and s.expires_at > now()
      and (
        p_topic = 'session:' || s.id
        or p_topic = 'session:' || s.id || ':ops'
      )
      and (
        not p_require_edit
        or p.role = 'coach'
        or (
          p_topic = 'session:' || s.id || ':ops'
          and (
            coalesce((p.permissions ->> 'add')::boolean, false)
            or coalesce((p.permissions ->> 'move')::boolean, false)
            or coalesce((p.permissions ->> 'edit')::boolean, false)
            or coalesce((p.permissions ->> 'delete')::boolean, false)
            or coalesce((p.permissions ->> 'connect')::boolean, false)
          )
        )
        or p_topic = 'session:' || s.id
      )
  )
$$;
revoke execute on function private.session_member(text, boolean) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.session_member(text, boolean) to authenticated;

create policy "Teilnehmende empfangen Nachrichten ihrer Sitzung"
on realtime.messages for select to authenticated
using (
  realtime.messages.extension in ('broadcast', 'presence')
  and private.session_member((select realtime.topic()), false)
);

create policy "Teilnehmende senden Nachrichten ihrer Sitzung"
on realtime.messages for insert to authenticated
with check (
  realtime.messages.extension in ('broadcast', 'presence')
  and private.session_member((select realtime.topic()), true)
);


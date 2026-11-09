-- =====================================================================
-- ConstellaBoard: Sitzungen, Teilnehmende, Brettzustand, Zugangstoken
--
-- Grundsatz: Browser greifen NIE direkt auf diese Tabellen zu.
-- Alle Lese- und Schreibzugriffe laufen über Edge Functions (Service-Role)
-- mit serverseitiger Berechtigungsprüfung. RLS ist aktiviert und es gibt
-- bewusst keine Policies für anon/authenticated → Zugriff verweigert.
-- Einzige Ausnahme: Realtime-Autorisierung über realtime.messages.
-- =====================================================================

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------

create table public.sessions (
  id                  text primary key check (id ~ '^[A-Za-z0-9_-]{16,64}$'),
  status              text not null default 'active' check (status in ('active', 'ended')),
  created_at          timestamptz not null default now(),
  last_activity_at    timestamptz not null default now(),
  expires_at          timestamptz not null,
  ended_at            timestamptz,
  end_reason          text check (end_reason in ('closed', 'inactive', 'expired')),
  inactivity_minutes  integer not null default 90 check (inactivity_minutes between 10 and 720),
  access_code_hash    text,
  access_code_salt    text,
  default_permissions jsonb not null default '{"add":true,"move":true,"edit":true,"delete":false,"connect":true,"lock":false,"seeHidden":false}'::jsonb
);
comment on table public.sessions is 'Temporäre Sitzungen. Inhalte werden beim Beenden gelöscht; die Zeile selbst nach 7 Tagen.';

create table public.session_tokens (
  id          uuid primary key default gen_random_uuid(),
  session_id  text not null references public.sessions (id) on delete cascade,
  role        text not null check (role in ('coach', 'participant')),
  token_hash  text not null unique check (length(token_hash) = 64),
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);
comment on table public.session_tokens is 'Nur SHA-256-Hashes der Einladungs- und Coach-Token, niemals Klartext.';
create index session_tokens_session_idx on public.session_tokens (session_id);

create table public.participants (
  id            uuid primary key default gen_random_uuid(),
  session_id    text not null references public.sessions (id) on delete cascade,
  auth_uid      uuid not null,
  role          text not null check (role in ('coach', 'participant')),
  display_name  text not null default 'Gast' check (char_length(display_name) between 1 and 40),
  color         text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  permissions   jsonb not null,
  joined_at     timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  revoked_at    timestamptz,
  unique (session_id, auth_uid)
);
comment on table public.participants is 'Temporäre Teilnehmerdaten (keine Namenspflicht). Werden beim Beenden gelöscht.';
create index participants_auth_idx on public.participants (auth_uid);

create table public.board_states (
  session_id  text primary key references public.sessions (id) on delete cascade,
  state       jsonb not null,
  version     bigint not null default 0,
  updated_at  timestamptz not null default now(),
  constraint board_state_size check (pg_column_size(state) < 2000000)
);
comment on table public.board_states is 'Aktueller Brettzustand einer laufenden Sitzung. Wird beim Beenden gelöscht.';

create table private.rate_limits (
  bucket        text not null,
  window_start  timestamptz not null,
  hits          integer not null default 0,
  primary key (bucket, window_start)
);

alter table public.sessions enable row level security;
alter table public.session_tokens enable row level security;
alter table public.participants enable row level security;
alter table public.board_states enable row level security;
alter table private.rate_limits enable row level security;

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

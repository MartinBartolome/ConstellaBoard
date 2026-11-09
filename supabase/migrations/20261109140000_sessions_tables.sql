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


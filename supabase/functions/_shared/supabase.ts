import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0'
import { HttpError, clientIp } from './http.ts'
import { sha256Hex } from './crypto.ts'
import { normalizePermissions, type Permissions } from './domain/permissions.ts'

const URL = Deno.env.get('SUPABASE_URL')!
// Nur serverseitig verfügbar. Gelangt niemals in Antworten oder in den Browser.
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

export const admin: SupabaseClient = createClient(URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** Liest die anonyme Benutzer-ID aus dem JWT der Anfrage. */
export async function requireUser(req: Request): Promise<string> {
  const auth = req.headers.get('authorization') ?? ''
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!jwt) throw new HttpError(401, 'unauthorized', 'Nicht angemeldet.')
  const { data, error } = await admin.auth.getUser(jwt)
  if (error || !data.user) throw new HttpError(401, 'unauthorized', 'Nicht angemeldet.')
  return data.user.id
}

/** Rate-Limit; wirft 429, wenn überschritten. */
export async function rateLimit(bucket: string, limit: number, windowSeconds: number): Promise<void> {
  const { data, error } = await admin.rpc('rate_limit_hit', { p_bucket: bucket, p_limit: limit, p_window_seconds: windowSeconds })
  if (error) throw error
  if (data !== true) throw new HttpError(429, 'rate_limited', 'Zu viele Anfragen. Bitte kurz warten.')
}

/** IP-Adresse nur gehasht und gesalzen als Rate-Limit-Schlüssel verwenden. */
export async function ipBucket(req: Request, name: string): Promise<string> {
  const day = new Date().toISOString().slice(0, 10)
  return `${name}:${(await sha256Hex(`${SERVICE_KEY.slice(-16)}|${day}|${clientIp(req)}`)).slice(0, 32)}`
}

export interface SessionRow {
  id: string
  status: 'active' | 'ended'
  expires_at: string
  last_activity_at: string
  inactivity_minutes: number
  access_code_hash: string | null
  access_code_salt: string | null
  default_permissions: unknown
}

export interface ParticipantRow {
  id: string
  session_id: string
  auth_uid: string
  role: 'coach' | 'participant'
  display_name: string
  color: string
  permissions: unknown
  revoked_at: string | null
}

export function isSessionOpen(s: SessionRow): boolean {
  const idleLimit = new Date(s.last_activity_at).getTime() + s.inactivity_minutes * 60_000
  return s.status === 'active' && new Date(s.expires_at).getTime() > Date.now() && idleLimit > Date.now()
}

export async function loadSession(sessionId: string): Promise<SessionRow> {
  const { data, error } = await admin.from('sessions').select('*').eq('id', sessionId).maybeSingle()
  if (error) throw error
  if (!data) throw new HttpError(404, 'not_found', 'Diese Sitzung existiert nicht oder ist beendet.')
  const s = data as SessionRow
  if (!isSessionOpen(s)) throw new HttpError(410, 'ended', 'Diese Sitzung wurde beendet.')
  return s
}

export interface Member {
  session: SessionRow
  participant: ParticipantRow
  permissions: Permissions
  /** Client-ID für Revisionen, fest an die Person gebunden */
  clientId: string
}

/** Lädt die aufrufende Person als Mitglied einer aktiven Sitzung. */
export async function requireMember(req: Request, sessionId: string): Promise<Member> {
  const uid = await requireUser(req)
  const session = await loadSession(sessionId)
  const { data, error } = await admin
    .from('participants')
    .select('*')
    .eq('session_id', sessionId)
    .eq('auth_uid', uid)
    .is('revoked_at', null)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new HttpError(403, 'forbidden', 'Kein Zugang zu dieser Sitzung.')
  const p = data as ParticipantRow
  return { session, participant: p, permissions: normalizePermissions(p.permissions), clientId: clientIdOf(p.id) }
}

export function clientIdOf(participantId: string): string {
  return participantId.replace(/-/g, '')
}

export async function touchActivity(sessionId: string): Promise<void> {
  await admin.from('sessions').update({ last_activity_at: new Date().toISOString() }).eq('id', sessionId).eq('status', 'active')
}

/** Sendet eine Steuernachricht an alle im privaten Sitzungskanal (serverseitig). */
export async function broadcastControl(sessionId: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const res = await fetch(`${URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ messages: [{ topic: `session:${sessionId}`, event: 'control', payload, private: true }] }),
    })
    if (!res.ok) console.error('Broadcast fehlgeschlagen', res.status)
  } catch (e) {
    console.error('Broadcast fehlgeschlagen', e instanceof Error ? e.message : String(e))
  }
}

export function publicParticipant(p: ParticipantRow) {
  return {
    id: p.id,
    clientId: clientIdOf(p.id),
    role: p.role,
    displayName: p.display_name,
    color: p.color,
    permissions: normalizePermissions(p.permissions),
  }
}

export function publicSession(s: SessionRow) {
  return {
    id: s.id,
    status: s.status,
    expiresAt: s.expires_at,
    inactivityMinutes: s.inactivity_minutes,
    hasAccessCode: !!s.access_code_hash,
  }
}

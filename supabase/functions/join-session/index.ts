/**
 * join-session: Beitritt mit Coach- oder Teilnehmer-Token (+ optional Zugangscode).
 * Idempotent: erneuter Beitritt derselben anonymen Kennung liefert dieselbe Person.
 */
import { HttpError, SESSION_ID, TOKEN, json, readJson, serve, str } from '../_shared/http.ts'
import { hashAccessCode, sha256Hex, timingSafeEqual } from '../_shared/crypto.ts'
import {
  admin, broadcastControl, ipBucket, loadSession, publicParticipant, publicSession, rateLimit, requireUser, touchActivity,
  type ParticipantRow,
} from '../_shared/supabase.ts'
import { COACH_PERMISSIONS, normalizePermissions } from '../_shared/domain/permissions.ts'

const COLORS = ['#c0704f', '#6f93a8', '#5b7a5a', '#7d5a78', '#d9a441', '#c98a8f', '#3e5470', '#7a5c45']
const MAX_PARTICIPANTS = 20

serve(async (req) => {
  const uid = await requireUser(req)
  await rateLimit(await ipBucket(req, 'join'), 30, 600)
  const body = await readJson(req)
  const sessionId = str(body.sessionId, 'sessionId', { pattern: SESSION_ID })
  const token = str(body.token, 'token', { pattern: TOKEN })
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 40) : ''
  await rateLimit(`join-session:${sessionId}`, 60, 600)

  const notFound = new HttpError(404, 'not_found', 'Dieser Link ist ungültig oder die Sitzung ist beendet.')
  const session = await loadSession(sessionId).catch((e) => {
    throw e instanceof HttpError && e.status === 410 ? e : notFound
  })
  const { data: tok } = await admin
    .from('session_tokens')
    .select('role')
    .eq('session_id', sessionId)
    .eq('token_hash', await sha256Hex(token))
    .is('revoked_at', null)
    .maybeSingle()
  if (!tok) throw notFound
  const role = tok.role as 'coach' | 'participant'

  if (role === 'participant' && session.access_code_hash) {
    if (typeof body.accessCode !== 'string' || body.accessCode.length === 0)
      throw new HttpError(401, 'access_code_required', 'Für diese Sitzung ist ein Zugangscode nötig.')
    await rateLimit(`code:${sessionId}`, 10, 600)
    const h = await hashAccessCode(body.accessCode.slice(0, 32), session.access_code_salt ?? '')
    if (!timingSafeEqual(h, session.access_code_hash)) throw new HttpError(401, 'access_code_wrong', 'Der Zugangscode ist falsch.')
  }

  // Bereits beigetreten?
  const { data: existing } = await admin.from('participants').select('*').eq('session_id', sessionId).eq('auth_uid', uid).maybeSingle()
  let p = existing as ParticipantRow | null
  if (p?.revoked_at) throw new HttpError(403, 'removed', 'Sie wurden aus dieser Sitzung entfernt.')
  if (p) {
    // Rolle kann nur aufgewertet werden (Coach-Link in bestehendem Tab)
    const patch: Record<string, unknown> = { last_seen_at: new Date().toISOString() }
    if (role === 'coach' && p.role !== 'coach') Object.assign(patch, { role: 'coach', permissions: COACH_PERMISSIONS })
    if (displayName) patch.display_name = displayName
    const { data, error } = await admin.from('participants').update(patch).eq('id', p.id).select('*').single()
    if (error) throw error
    p = data as ParticipantRow
  } else {
    const { count } = await admin.from('participants').select('id', { count: 'exact', head: true }).eq('session_id', sessionId)
    if ((count ?? 0) >= MAX_PARTICIPANTS) throw new HttpError(409, 'full', 'Diese Sitzung ist voll.')
    const { data, error } = await admin
      .from('participants')
      .insert({
        session_id: sessionId,
        auth_uid: uid,
        role,
        display_name: displayName || (role === 'coach' ? 'Coach' : `Gast ${(count ?? 0) + 1}`),
        color: COLORS[(count ?? 0) % COLORS.length],
        permissions: role === 'coach' ? COACH_PERMISSIONS : normalizePermissions(session.default_permissions),
      })
      .select('*')
      .single()
    if (error) throw error
    p = data as ParticipantRow
    await broadcastControl(sessionId, { type: 'participants-changed' })
  }
  await touchActivity(sessionId)
  return json(req, { participant: publicParticipant(p), session: publicSession(session) })
})

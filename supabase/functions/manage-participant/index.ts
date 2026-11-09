/**
 * manage-participant: nur Coach.
 *   action "list"        → Teilnehmende auflisten
 *   action "permissions" → Rechte einer Person ändern
 *   action "remove"      → Person entfernen (Zugang sofort gesperrt)
 */
import { HttpError, SESSION_ID, json, readJson, serve, str } from '../_shared/http.ts'
import { admin, broadcastControl, publicParticipant, requireMember, type ParticipantRow } from '../_shared/supabase.ts'
import { normalizePermissions } from '../_shared/domain/permissions.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

serve(async (req) => {
  const body = await readJson(req)
  const sessionId = str(body.sessionId, 'sessionId', { pattern: SESSION_ID })
  const m = await requireMember(req, sessionId)
  if (m.participant.role !== 'coach') throw new HttpError(403, 'forbidden', 'Nur der Coach kann Teilnehmende verwalten.')

  if (body.action === 'list') {
    const { data, error } = await admin.from('participants').select('*').eq('session_id', sessionId).is('revoked_at', null).order('joined_at')
    if (error) throw error
    return json(req, { participants: (data as ParticipantRow[]).map(publicParticipant) })
  }

  const participantId = str(body.participantId, 'participantId', { pattern: UUID })
  const { data: target } = await admin.from('participants').select('*').eq('id', participantId).eq('session_id', sessionId).maybeSingle()
  if (!target) throw new HttpError(404, 'not_found', 'Person nicht gefunden.')
  if ((target as ParticipantRow).role === 'coach') throw new HttpError(400, 'invalid', 'Die Rechte des Coaches können nicht geändert werden.')

  if (body.action === 'permissions') {
    const permissions = normalizePermissions(body.permissions)
    const { data, error } = await admin.from('participants').update({ permissions }).eq('id', participantId).select('*').single()
    if (error) throw error
    await broadcastControl(sessionId, { type: 'permissions', participantId })
    return json(req, { participant: publicParticipant(data as ParticipantRow) })
  }
  if (body.action === 'remove') {
    const { error } = await admin.from('participants').update({ revoked_at: new Date().toISOString() }).eq('id', participantId)
    if (error) throw error
    await broadcastControl(sessionId, { type: 'removed', participantId })
    return json(req, { removed: true })
  }
  throw new HttpError(400, 'invalid', 'Unbekannte Aktion.')
})

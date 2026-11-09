/**
 * close-session: nur Coach. Benachrichtigt alle, sperrt, widerruft Token und
 * löscht Brettzustand und Teilnehmerdaten (siehe end_session in der Datenbank).
 */
import { HttpError, SESSION_ID, json, readJson, serve, str } from '../_shared/http.ts'
import { admin, broadcastControl, requireMember } from '../_shared/supabase.ts'

serve(async (req) => {
  const body = await readJson(req)
  const sessionId = str(body.sessionId, 'sessionId', { pattern: SESSION_ID })
  const m = await requireMember(req, sessionId)
  if (m.participant.role !== 'coach') throw new HttpError(403, 'forbidden', 'Nur der Coach kann die Sitzung beenden.')
  const { data, error } = await admin.rpc('end_session', { p_session_id: sessionId, p_reason: 'closed' })
  if (error) throw error
  // Nach dem Löschen alle verbundenen Geräte informieren, damit sie die Verbindung trennen
  await broadcastControl(sessionId, { type: 'ended' })
  return json(req, { ended: data === true })
})

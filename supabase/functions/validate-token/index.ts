/**
 * validate-token: Lebenszeichen und aktuelle Rechte der aufrufenden Person.
 * Antwortet 410, wenn die Sitzung beendet ist, und 403, wenn die Person entfernt wurde.
 */
import { SESSION_ID, json, readJson, serve, str } from '../_shared/http.ts'
import { admin, publicParticipant, publicSession, requireMember, touchActivity } from '../_shared/supabase.ts'

serve(async (req) => {
  const body = await readJson(req)
  const sessionId = str(body.sessionId, 'sessionId', { pattern: SESSION_ID })
  const m = await requireMember(req, sessionId)
  await admin.from('participants').update({ last_seen_at: new Date().toISOString() }).eq('id', m.participant.id)
  // Ein geöffnetes Brett gilt als Aktivität (sichtbarer Tab sendet alle paar Minuten)
  if (body.active === true) await touchActivity(sessionId)
  return json(req, { participant: publicParticipant(m.participant), session: publicSession(m.session) })
})

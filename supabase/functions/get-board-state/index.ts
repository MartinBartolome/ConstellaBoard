/** get-board-state: aktueller Brettzustand für Mitglieder der Sitzung. */
import { SESSION_ID, json, readJson, serve, str } from '../_shared/http.ts'
import { admin, requireMember } from '../_shared/supabase.ts'
import type { BoardState } from '../_shared/domain/types.ts'

serve(async (req) => {
  const body = await readJson(req)
  const sessionId = str(body.sessionId, 'sessionId', { pattern: SESSION_ID })
  const m = await requireMember(req, sessionId)
  const { data, error } = await admin.from('board_states').select('state, version').eq('session_id', sessionId).single()
  if (error) throw error
  let state = data.state as BoardState
  if (!m.permissions.seeHidden) {
    // Ausgeblendete Elemente nur an berechtigte Personen ausliefern
    const entities = Object.fromEntries(Object.entries(state.entities).filter(([, e]) => e.data.visible))
    state = { ...state, entities }
  }
  return json(req, { state, version: data.version })
})

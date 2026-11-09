/**
 * update-board-state: übernimmt geprüfte Operationen in den gespeicherten Zustand.
 *
 * - jede Operation wird validiert (Schema, Grössen) und gegen die Rechte geprüft
 * - Revisionen müssen die Client-ID der Person tragen (keine Fremdrevisionen)
 * - Zusammenführung ist kommutativ und idempotent; bei gleichzeitigem Schreiben
 *   sorgt eine Versionsprüfung (optimistic locking) mit Wiederholung dafür,
 *   dass keine Änderung verloren geht
 */
import { HttpError, SESSION_ID, json, readJson, serve, str } from '../_shared/http.ts'
import { admin, rateLimit, requireMember, touchActivity } from '../_shared/supabase.ts'
import { applyOp } from '../_shared/domain/merge.ts'
import { isOpAllowed } from '../_shared/domain/permissions.ts'
import { validateOps } from '../_shared/domain/validate.ts'
import type { BoardState } from '../_shared/domain/types.ts'

const MAX_ENTITIES = 2000

serve(async (req) => {
  const body = await readJson(req, 1024 * 1024)
  const sessionId = str(body.sessionId, 'sessionId', { pattern: SESSION_ID })
  const m = await requireMember(req, sessionId)
  await rateLimit(`update:${m.participant.id}`, 240, 60)

  for (let attempt = 0; attempt < 6; attempt++) {
    const { data, error } = await admin.from('board_states').select('state, version').eq('session_id', sessionId).single()
    if (error) throw error
    let state = data.state as BoardState
    const kindOf = (id: string) => state.entities[id]?.data.kind
    const ops = validateOps(body.ops, kindOf)
    if (!ops) throw new HttpError(400, 'invalid_ops', 'Ungültige Änderungen.')
    if (ops.some((op) => op.rev.c !== m.clientId)) throw new HttpError(400, 'invalid_rev', 'Ungültige Revision.')

    let rejected = 0
    const before = state
    for (const op of ops) {
      if (!isOpAllowed(op, m.permissions, state, m.clientId)) {
        rejected++
        continue
      }
      state = applyOp(state, op)
    }
    if (Object.keys(state.entities).length > MAX_ENTITIES) throw new HttpError(413, 'too_many', 'Zu viele Elemente auf dem Brett.')
    if (state === before) return json(req, { version: data.version, rejected })

    const { data: upd, error: e2 } = await admin
      .from('board_states')
      .update({ state, version: data.version + 1, updated_at: new Date().toISOString() })
      .eq('session_id', sessionId)
      .eq('version', data.version)
      .select('version')
    if (e2) throw e2
    if (upd && upd.length === 1) {
      await touchActivity(sessionId)
      return json(req, { version: upd[0]!.version, rejected })
    }
    // Jemand anderes hat gleichzeitig geschrieben → neu laden und erneut zusammenführen
    await new Promise((r) => setTimeout(r, 20 + Math.random() * 60 * (attempt + 1)))
  }
  throw new HttpError(409, 'conflict', 'Gleichzeitige Änderungen, bitte erneut senden.')
})

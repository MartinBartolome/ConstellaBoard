/**
 * create-session: erstellt eine neue, leere Sitzung.
 * Antwort enthält das Coach-Token im Klartext (einmalig); gespeichert werden nur Hashes.
 */
import { HttpError, json, readJson, serve } from '../_shared/http.ts'
import { deriveParticipantToken, hashAccessCode, randomToken, sha256Hex } from '../_shared/crypto.ts'
import { admin, ipBucket, rateLimit, requireUser } from '../_shared/supabase.ts'
import { DEFAULT_PARTICIPANT_PERMISSIONS, normalizePermissions } from '../_shared/domain/permissions.ts'
import { emptyBoard } from '../_shared/domain/types.ts'

const MAX_LIFETIME_HOURS = 12

serve(async (req) => {
  await requireUser(req)
  await rateLimit(await ipBucket(req, 'create'), 10, 3600)
  const body = await readJson<{ accessCode?: unknown; inactivityMinutes?: unknown; defaultPermissions?: unknown }>(req)

  let accessCodeHash: string | null = null
  let accessCodeSalt: string | null = null
  if (body.accessCode !== undefined && body.accessCode !== null && body.accessCode !== '') {
    if (typeof body.accessCode !== 'string' || body.accessCode.length < 4 || body.accessCode.length > 32)
      throw new HttpError(400, 'invalid', 'Der Zugangscode muss 4 bis 32 Zeichen lang sein.')
    accessCodeSalt = randomToken(16)
    accessCodeHash = await hashAccessCode(body.accessCode, accessCodeSalt)
  }
  const inactivity = typeof body.inactivityMinutes === 'number' ? Math.round(body.inactivityMinutes) : 90
  if (inactivity < 10 || inactivity > 720) throw new HttpError(400, 'invalid', 'Ungültige Inaktivitätszeit.')
  const defaults = body.defaultPermissions ? normalizePermissions(body.defaultPermissions) : DEFAULT_PARTICIPANT_PERMISSIONS

  const sessionId = randomToken(16)
  const coachToken = randomToken(32)
  const participantToken = await deriveParticipantToken(coachToken, sessionId)
  const expiresAt = new Date(Date.now() + MAX_LIFETIME_HOURS * 3600_000).toISOString()

  const { error: e1 } = await admin.from('sessions').insert({
    id: sessionId,
    expires_at: expiresAt,
    inactivity_minutes: inactivity,
    access_code_hash: accessCodeHash,
    access_code_salt: accessCodeSalt,
    default_permissions: defaults,
  })
  if (e1) throw e1
  const { error: e2 } = await admin.from('session_tokens').insert([
    { session_id: sessionId, role: 'coach', token_hash: await sha256Hex(coachToken) },
    { session_id: sessionId, role: 'participant', token_hash: await sha256Hex(participantToken) },
  ])
  const { error: e3 } = e2 ? { error: null } : await admin.from('board_states').insert({ session_id: sessionId, state: emptyBoard(), version: 0 })
  if (e2 || e3) {
    await admin.from('sessions').delete().eq('id', sessionId)
    throw e2 ?? e3
  }
  return json(req, { sessionId, coachToken, participantToken, expiresAt }, 201)
})

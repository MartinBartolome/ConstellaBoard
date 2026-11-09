/**
 * cleanup-expired-sessions: beendet abgelaufene/inaktive Sitzungen.
 * Läuft automatisch alle 5 Minuten per pg_cron in der Datenbank. Diese Funktion
 * erlaubt zusätzlich einen externen Aufruf (z. B. GitHub Actions) und ist mit
 * dem Geheimnis CRON_SECRET geschützt (verify_jwt = false).
 */
import { HttpError, json, serve } from '../_shared/http.ts'
import { timingSafeEqual } from '../_shared/crypto.ts'
import { admin } from '../_shared/supabase.ts'

serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET') ?? ''
  const given = req.headers.get('x-cron-secret') ?? ''
  if (secret.length < 32 || !timingSafeEqual(given, secret)) throw new HttpError(401, 'unauthorized', 'Nicht berechtigt.')
  const { data, error } = await admin.rpc('cleanup_expired_sessions')
  if (error) throw error
  return json(req, { ended: data })
})

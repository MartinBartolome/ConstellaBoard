import { base64Url } from '../lib/id'

/**
 * Leitet das Teilnehmer-Token aus dem Coach-Token ab (HMAC-SHA-256).
 * Identisch implementiert in supabase/functions/_shared/crypto.ts.
 */
export async function deriveParticipantToken(coachToken: string, sessionId: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(coachToken), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`participant:${sessionId}`))
  return base64Url(new Uint8Array(sig))
}

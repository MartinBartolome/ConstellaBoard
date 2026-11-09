/** Kryptografische Hilfen (Web Crypto, keine Abhängigkeiten). */

export function base64Url(buf: Uint8Array): string {
  let s = ''
  for (const b of buf) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function randomToken(bytes = 32): string {
  const b = new Uint8Array(bytes)
  crypto.getRandomValues(b)
  return base64Url(b)
}

export async function sha256Hex(input: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Leitet das Teilnehmer-Token aus dem Coach-Token ab. So kann der Coach den
 * Einladungslink jederzeit neu anzeigen, obwohl der Server nur Hashes speichert.
 * Identisch implementiert in src/sync/inviteToken.ts.
 */
export async function deriveParticipantToken(coachToken: string, sessionId: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(coachToken), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`participant:${sessionId}`))
  return base64Url(new Uint8Array(sig))
}

/** PBKDF2 für den optionalen (kurzen) Zugangscode. */
export async function hashAccessCode(code: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 210_000 },
    key,
    256,
  )
  return base64Url(new Uint8Array(bits))
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

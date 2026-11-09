/**
 * Konfiguration der Server-Anbindung. Im Browser sind ausschliesslich die
 * öffentliche Projekt-URL und der öffentliche Anon-/Publishable-Key bekannt.
 * Der Service-Role-Key existiert nur in den Edge Functions.
 */
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export function isBackendConfigured(): boolean {
  return SUPABASE_URL.startsWith('https://') || SUPABASE_URL.startsWith('http://localhost') || SUPABASE_URL.startsWith('http://127.0.0.1')
    ? SUPABASE_ANON_KEY.length > 20
    : false
}

if (SUPABASE_ANON_KEY && /service_role|sb_secret_/.test(atobSafe(SUPABASE_ANON_KEY) + SUPABASE_ANON_KEY)) {
  // Schutz vor Fehlkonfiguration: niemals mit geheimem Schlüssel starten
  throw new Error('VITE_SUPABASE_ANON_KEY enthält einen geheimen Schlüssel. Bitte nur den öffentlichen Anon-/Publishable-Key verwenden.')
}

function atobSafe(jwt: string): string {
  try {
    const part = jwt.split('.')[1]
    return part ? atob(part.replace(/-/g, '+').replace(/_/g, '/')) : ''
  } catch {
    return ''
  }
}

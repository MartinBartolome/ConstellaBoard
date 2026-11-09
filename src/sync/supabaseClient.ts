import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL, isBackendConfigured } from './config'

let client: SupabaseClient | null = null

/**
 * Supabase-Client für den Browser. Die anonyme Anmeldung wird nur im
 * sessionStorage gehalten: sie gilt pro Tab und verschwindet beim Schliessen.
 */
export function supabase(): SupabaseClient {
  if (!isBackendConfigured()) throw new Error('Server nicht konfiguriert')
  client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: window.sessionStorage,
      storageKey: 'constellaboard-auth',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    realtime: { params: { eventsPerSecond: 30 } },
  })
  return client
}

/** Stellt sicher, dass eine anonyme technische Kennung existiert. */
export async function ensureAnonymousUser(): Promise<string> {
  const sb = supabase()
  const { data } = await sb.auth.getSession()
  if (data.session) return data.session.access_token
  const { data: signed, error } = await sb.auth.signInAnonymously()
  if (error || !signed.session) {
    throw new Error(
      error?.message?.includes('Anonymous sign-ins are disabled')
        ? 'Anonyme Anmeldung ist im Supabase-Projekt deaktiviert (Authentication → Sign In / Providers).'
        : 'Verbindung zum Server fehlgeschlagen. Bitte später erneut versuchen.',
    )
  }
  return signed.session.access_token
}

export async function signOutLocal(): Promise<void> {
  if (!client) return
  await client.removeAllChannels()
  await client.auth.signOut({ scope: 'local' }).catch(() => undefined)
}

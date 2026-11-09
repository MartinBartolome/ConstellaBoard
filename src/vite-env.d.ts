/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Projekt-URL, z. B. https://xyz.supabase.co */
  readonly VITE_SUPABASE_URL?: string
  /** Öffentlicher Anon-/Publishable-Key (nie den Service-Role-Key!) */
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

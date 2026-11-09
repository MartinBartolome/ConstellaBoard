// Kopiert die gemeinsam genutzte Fachlogik (Datenmodell, Zusammenführung,
// Berechtigungen, Validierung) in die Edge Functions. So prüfen Browser und
// Server mit exakt demselben Code. Ein Unit-Test stellt sicher, dass die
// Kopien aktuell sind.
import { copyFileSync, mkdirSync } from 'node:fs'

export const SHARED_DOMAIN_FILES = ['types.ts', 'rev.ts', 'merge.ts', 'permissions.ts', 'validate.ts']
const target = 'supabase/functions/_shared/domain'
mkdirSync(target, { recursive: true })
for (const f of SHARED_DOMAIN_FILES) copyFileSync(`src/domain/${f}`, `${target}/${f}`)
console.log(`Domain-Dateien nach ${target} kopiert.`)

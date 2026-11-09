import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const FILES = ['types.ts', 'rev.ts', 'merge.ts', 'permissions.ts', 'validate.ts']

describe('Gemeinsame Fachlogik', () => {
  it.each(FILES)('%s ist in den Edge Functions aktuell (npm run sync:shared)', (f) => {
    const a = readFileSync(`src/domain/${f}`, 'utf8')
    const b = readFileSync(`supabase/functions/_shared/domain/${f}`, 'utf8')
    expect(b).toBe(a)
  })
})

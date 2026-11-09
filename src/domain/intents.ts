import type { BoardEntity, BoardOp, BoardState, Rev } from './types'

/**
 * Eine „Absicht" ist eine Operation ohne Revision. Absichten werden in der
 * Undo-/Redo-Historie gespeichert und beim Ausführen mit frischen Revisionen
 * versehen. So werden auch Rückgängig-Schritte korrekt an alle Teilnehmenden
 * synchronisiert und gewinnen gegen ältere Änderungen.
 */
export type Intent =
  | { op: 'create'; entity: BoardEntity }
  | { op: 'patch'; id: string; fields: Record<string, unknown> }
  | { op: 'delete'; id: string }

export function withRev(intent: Intent, rev: Rev): BoardOp {
  switch (intent.op) {
    case 'create':
      return { op: 'create', entity: intent.entity, rev }
    case 'patch':
      return { op: 'patch', id: intent.id, fields: intent.fields, rev }
    case 'delete':
      return { op: 'delete', id: intent.id, rev }
  }
}

/**
 * Berechnet die Umkehrung von Absichten bezogen auf einen Zustand.
 * Die Rückgabe ist in umgekehrter Reihenfolge, damit sie direkt
 * ausgeführt werden kann.
 */
export function invertIntents(state: BoardState, intents: readonly Intent[]): Intent[] {
  const inverse: Intent[] = []
  // Zwischenzustand mitführen, damit z. B. create + patch im selben Schritt korrekt invertiert wird
  const seen = new Map<string, BoardEntity | null>()
  const current = (id: string): BoardEntity | null => {
    if (seen.has(id)) return seen.get(id) ?? null
    return state.entities[id]?.data ?? null
  }
  for (const it of intents) {
    switch (it.op) {
      case 'create': {
        const prev = current(it.entity.id)
        inverse.push(prev ? { op: 'create', entity: prev } : { op: 'delete', id: it.entity.id })
        seen.set(it.entity.id, it.entity)
        break
      }
      case 'patch': {
        const prev = current(it.id)
        if (!prev) break
        const old: Record<string, unknown> = {}
        const rec = prev as unknown as Record<string, unknown>
        for (const k of Object.keys(it.fields)) old[k] = rec[k]
        inverse.push({ op: 'patch', id: it.id, fields: old })
        seen.set(it.id, { ...prev, ...it.fields } as BoardEntity)
        break
      }
      case 'delete': {
        const prev = current(it.id)
        if (!prev) break
        inverse.push({ op: 'create', entity: prev })
        seen.set(it.id, null)
        break
      }
    }
  }
  return inverse.reverse()
}

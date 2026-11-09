import { compareRev } from './rev'
import type { BoardEntity, BoardOp, BoardState, Rev, StoredEntity } from './types'

/**
 * Wendet eine Operation auf den Brettzustand an (rein funktional).
 *
 * Eigenschaften:
 * - kommutativ und idempotent: Reihenfolge und doppelte Zustellung spielen keine Rolle
 * - Konfliktregel: pro Feld gewinnt die höhere Revision
 * - Löschen erzeugt einen Grabstein; ein späteres „create" mit höherer
 *   Revision (z. B. Rückgängig) stellt das Element wieder her
 *
 * Gibt denselben Zustand (Referenz) zurück, wenn die Operation nichts ändert.
 */
export function applyOp(state: BoardState, op: BoardOp): BoardState {
  switch (op.op) {
    case 'create': {
      const id = op.entity.id
      const tomb = state.tombstones[id]
      if (tomb && compareRev(op.rev, tomb) <= 0) return state
      const existing = state.entities[id]
      let stored: StoredEntity
      if (!existing) {
        const revs: Record<string, Rev> = {}
        for (const k of Object.keys(op.entity)) revs[k] = op.rev
        stored = { data: { ...op.entity }, revs }
      } else {
        const merged = mergeFields(existing, op.entity as unknown as Record<string, unknown>, op.rev)
        if (merged === existing) {
          if (!tomb) return state
          stored = existing
        } else stored = merged
      }
      const tombstones = tomb ? omit(state.tombstones, id) : state.tombstones
      return { ...state, entities: { ...state.entities, [id]: stored }, tombstones }
    }
    case 'patch': {
      const existing = state.entities[op.id]
      if (!existing) return state
      const merged = mergeFields(existing, op.fields, op.rev)
      if (merged === existing) return state
      return { ...state, entities: { ...state.entities, [op.id]: merged } }
    }
    case 'delete': {
      const tomb = state.tombstones[op.id]
      if (tomb && compareRev(op.rev, tomb) <= 0) return state
      const existing = state.entities[op.id]
      if (existing) {
        // Ein Löschen, das älter ist als die Erstellung, ignorieren
        const created = existing.revs.id
        if (created && compareRev(op.rev, created) <= 0) return state
      }
      return {
        ...state,
        entities: existing ? omit(state.entities, op.id) : state.entities,
        tombstones: { ...state.tombstones, [op.id]: op.rev },
      }
    }
  }
}

export function applyOps(state: BoardState, ops: readonly BoardOp[]): BoardState {
  let s = state
  for (const op of ops) s = applyOp(s, op)
  return s
}

const IMMUTABLE_FIELDS = new Set(['id', 'kind'])

function mergeFields(existing: StoredEntity, fields: Record<string, unknown>, rev: Rev): StoredEntity {
  let data: Record<string, unknown> | null = null
  let revs: Record<string, Rev> | null = null
  for (const [k, v] of Object.entries(fields)) {
    if (IMMUTABLE_FIELDS.has(k)) continue
    const cur = existing.revs[k]
    if (cur && compareRev(rev, cur) <= 0) continue
    data ??= { ...existing.data }
    revs ??= { ...existing.revs }
    data[k] = v
    revs[k] = rev
  }
  if (!data || !revs) return existing
  return { data: data as unknown as BoardEntity, revs }
}

function omit<T>(rec: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = rec
  void _removed
  return rest
}

/** Alle Elemente als Liste, nach Stapelreihenfolge sortiert. */
export function listEntities(state: BoardState): BoardEntity[] {
  return Object.values(state.entities)
    .map((s) => s.data)
    .sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : 1))
}

/** Höchste in einem Zustand enthaltene Revision (für Lamport-Uhr). */
export function highestRev(state: BoardState): number {
  let t = 0
  for (const e of Object.values(state.entities))
    for (const r of Object.values(e.revs)) if (r.t > t) t = r.t
  for (const r of Object.values(state.tombstones)) if (r.t > t) t = r.t
  return t
}

/** Führt zwei vollständige Zustände zusammen (z. B. Server + lokal nach Wiederverbindung). */
export function mergeStates(a: BoardState, b: BoardState): BoardState {
  let s = a
  for (const [id, stored] of Object.entries(b.entities)) {
    const ex = s.entities[id]
    const tomb = s.tombstones[id]
    const createdRev = stored.revs.id
    if (!ex) {
      if (tomb && createdRev && compareRev(createdRev, tomb) <= 0) continue
      s = { ...s, entities: { ...s.entities, [id]: stored } }
      if (tomb) s = { ...s, tombstones: omit(s.tombstones, id) }
      continue
    }
    let merged = ex
    for (const [k, r] of Object.entries(stored.revs)) {
      merged = mergeFields(merged, { [k]: (stored.data as unknown as Record<string, unknown>)[k] }, r)
    }
    if (merged !== ex) s = { ...s, entities: { ...s.entities, [id]: merged } }
  }
  for (const [id, r] of Object.entries(b.tombstones)) s = applyOp(s, { op: 'delete', id, rev: r })
  return s
}

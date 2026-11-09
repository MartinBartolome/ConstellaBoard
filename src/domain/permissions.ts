import type { BoardOp, BoardState } from './types.ts'

/** Berechtigungen einer Person in einer Sitzung (serverseitig gespeichert). */
export interface Permissions {
  add: boolean
  move: boolean
  edit: boolean
  delete: boolean
  connect: boolean
  lock: boolean
  seeHidden: boolean
}

export const COACH_PERMISSIONS: Permissions = {
  add: true, move: true, edit: true, delete: true, connect: true, lock: true, seeHidden: true,
}

export const DEFAULT_PARTICIPANT_PERMISSIONS: Permissions = {
  add: true, move: true, edit: true, delete: false, connect: true, lock: false, seeHidden: false,
}

export const VIEW_ONLY_PERMISSIONS: Permissions = {
  add: false, move: false, edit: false, delete: false, connect: false, lock: false, seeHidden: false,
}

export const PERMISSION_LABELS: Record<keyof Permissions, string> = {
  add: 'Figuren hinzufügen',
  move: 'Figuren bewegen',
  edit: 'Bearbeiten (Drehen, Farbe, Beschriftung)',
  delete: 'Löschen',
  connect: 'Verbindungen erstellen',
  lock: 'Sperren und Ausblenden',
  seeHidden: 'Ausgeblendetes sehen',
}

export function normalizePermissions(input: unknown): Permissions {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const b = (k: keyof Permissions) => o[k] === true
  return { add: b('add'), move: b('move'), edit: b('edit'), delete: b('delete'), connect: b('connect'), lock: b('lock'), seeHidden: b('seeHidden') }
}

const MOVE_FIELDS = new Set(['x', 'y'])
const LOCK_FIELDS = new Set(['locked', 'visible'])

/**
 * Prüft, ob eine Operation mit den gegebenen Rechten erlaubt ist.
 * Wird im Browser (Bedienung) und auf dem Server (verbindlich) verwendet.
 */
export function isOpAllowed(op: BoardOp, perms: Permissions, state: BoardState, actor?: string): boolean {
  switch (op.op) {
    case 'create': {
      const existing = state.entities[op.entity.id]
      if (existing) return perms.edit // Wiederherstellen bestehender Daten
      if (state.tombstones[op.entity.id]) return perms.delete || perms.add // Rückgängig eines Löschens
      if (op.entity.kind === 'connection') return perms.connect
      if (op.entity.locked || !op.entity.visible) return perms.add && perms.lock
      return perms.add
    }
    case 'delete': {
      const e = state.entities[op.id]?.data
      if (!e) return true // bereits gelöscht: harmlos
      if (e.locked && !perms.lock) return false
      // Selbst erstellte Elemente dürfen immer wieder entfernt werden (z. B. Rückgängig)
      const creator = state.entities[op.id]?.revs.id?.c
      if (actor && creator === actor) return true
      return perms.delete
    }
    case 'patch': {
      const e = state.entities[op.id]?.data
      if (!e) return true
      const keys = Object.keys(op.fields)
      const touchesLock = keys.some((k) => LOCK_FIELDS.has(k))
      if (touchesLock && !perms.lock) return false
      if (e.locked && !keys.every((k) => LOCK_FIELDS.has(k))) return false
      if (!e.visible && !perms.seeHidden) return false
      const onlyMove = keys.every((k) => MOVE_FIELDS.has(k))
      if (onlyMove) return perms.move
      const rest = keys.filter((k) => !LOCK_FIELDS.has(k))
      return rest.length === 0 ? perms.lock : perms.edit
    }
  }
}

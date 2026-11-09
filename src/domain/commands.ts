import { getPreset } from './connections'
import { getTemplate } from './library'
import type { Intent } from './intents'
import type { BoardEntity, BoardState, Connection, ConnectionType, Figure, Note } from './types'
import { randomId } from '../lib/id'

/**
 * Fachliche Befehle des Systembretts. Sie erzeugen Absichten (Intents),
 * verändern den Zustand aber nicht selbst.
 */

export function topZ(state: BoardState): number {
  let z = 0
  for (const e of Object.values(state.entities)) if (e.data.z > z) z = e.data.z
  return z
}

export function newFigure(state: BoardState, type: string, x: number, y: number, overrides: Partial<Figure> = {}): Figure {
  const tpl = getTemplate(type)
  return {
    id: randomId(),
    kind: 'figure',
    type: tpl.id,
    x,
    y,
    rotation: 0,
    scale: 1,
    color: tpl.color,
    label: '',
    visible: true,
    locked: false,
    groupId: null,
    z: topZ(state) + 1,
    ...overrides,
  }
}

export function newNote(state: BoardState, x: number, y: number, text = ''): Note {
  return {
    id: randomId(),
    kind: 'note',
    x,
    y,
    width: 180,
    text,
    color: '#fbf3d9',
    rotation: 0,
    scale: 1,
    visible: true,
    locked: false,
    groupId: null,
    z: topZ(state) + 1,
  }
}

export function newConnection(state: BoardState, from: string, to: string, type: ConnectionType = 'normal'): Connection {
  const p = getPreset(type)
  return {
    id: randomId(),
    kind: 'connection',
    type,
    from,
    to,
    color: p.color,
    width: p.width,
    style: p.style,
    direction: p.direction,
    label: '',
    visible: true,
    locked: false,
    // Linien liegen unter den Figuren
    z: -1000 + Object.keys(state.entities).length * 0.001,
  }
}

/** Alle Verbindungen, die an einem der Elemente hängen. */
export function attachedConnections(state: BoardState, ids: ReadonlySet<string>): string[] {
  const out: string[] = []
  for (const e of Object.values(state.entities)) {
    const d = e.data
    if (d.kind === 'connection' && !ids.has(d.id) && (ids.has(d.from) || ids.has(d.to))) out.push(d.id)
  }
  return out
}

/** Löschen inkl. abhängiger Verbindungen; gesperrte Elemente bleiben erhalten. */
export function deleteIntents(state: BoardState, ids: Iterable<string>): Intent[] {
  const set = new Set<string>()
  for (const id of ids) {
    const e = state.entities[id]?.data
    if (e && !e.locked) set.add(id)
  }
  const all = [...attachedConnections(state, set), ...set]
  return all.map((id) => ({ op: 'delete', id }))
}

/** Dupliziert Elemente mit Versatz; Verbindungen zwischen duplizierten Elementen werden mitkopiert. */
export function duplicateIntents(state: BoardState, ids: Iterable<string>, offset = 40): { intents: Intent[]; newIds: string[] } {
  const src = [...ids].map((id) => state.entities[id]?.data).filter((e): e is BoardEntity => !!e)
  const map = new Map<string, string>()
  const groupMap = new Map<string, string>()
  let z = topZ(state)
  const intents: Intent[] = []
  for (const e of src) {
    if (e.kind === 'connection') continue
    const id = randomId()
    map.set(e.id, id)
    let groupId: string | null = null
    if (e.groupId) {
      if (!groupMap.has(e.groupId)) groupMap.set(e.groupId, randomId())
      groupId = groupMap.get(e.groupId)!
    }
    intents.push({ op: 'create', entity: { ...e, id, x: e.x + offset, y: e.y + offset, z: ++z, locked: false, groupId } })
  }
  // Verbindungen zwischen zwei duplizierten Elementen werden mitkopiert
  for (const s of Object.values(state.entities)) {
    const c = s.data
    if (c.kind !== 'connection') continue
    if (map.has(c.from) && map.has(c.to)) {
      const id = randomId()
      map.set(c.id, id)
      intents.push({ op: 'create', entity: { ...c, id, from: map.get(c.from)!, to: map.get(c.to)!, locked: false } })
    }
  }
  return { intents, newIds: [...map.values()] }
}

export function groupIntents(state: BoardState, ids: Iterable<string>): Intent[] {
  const groupId = randomId()
  const out: Intent[] = []
  for (const id of ids) {
    const e = state.entities[id]?.data
    if (e && e.kind !== 'connection') out.push({ op: 'patch', id, fields: { groupId } })
  }
  return out.length >= 2 ? out : []
}

export function ungroupIntents(state: BoardState, ids: Iterable<string>): Intent[] {
  const out: Intent[] = []
  for (const id of ids) {
    const e = state.entities[id]?.data
    if (e && e.kind !== 'connection' && e.groupId) out.push({ op: 'patch', id, fields: { groupId: null } })
  }
  return out
}

/** Erweitert eine Auswahl um alle Mitglieder derselben Gruppen. */
export function expandGroups(state: BoardState, ids: Iterable<string>): Set<string> {
  const set = new Set(ids)
  const groups = new Set<string>()
  for (const id of set) {
    const e = state.entities[id]?.data
    if (e && e.kind !== 'connection' && e.groupId) groups.add(e.groupId)
  }
  if (groups.size === 0) return set
  for (const s of Object.values(state.entities)) {
    const e = s.data
    if (e.kind !== 'connection' && e.groupId && groups.has(e.groupId)) set.add(e.id)
  }
  return set
}

export function reorderIntents(state: BoardState, ids: Iterable<string>, where: 'front' | 'back'): Intent[] {
  const list = Object.values(state.entities).map((s) => s.data).filter((e) => e.kind !== 'connection')
  const zs = list.map((e) => e.z)
  const max = Math.max(0, ...zs)
  const min = Math.min(0, ...zs)
  let i = 0
  const out: Intent[] = []
  for (const id of ids) {
    const e = state.entities[id]?.data
    if (!e || e.kind === 'connection') continue
    i++
    out.push({ op: 'patch', id, fields: { z: where === 'front' ? max + i : min - i } })
  }
  return out
}

export function normalizeAngle(deg: number): number {
  const r = deg % 360
  return r < 0 ? r + 360 : r
}

export const SCALE_MIN = 0.3
export const SCALE_MAX = 4

export function clampScale(s: number): number {
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, s))
}

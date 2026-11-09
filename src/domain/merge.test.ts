import { describe, expect, it } from 'vitest'
import { applyOp, applyOps, listEntities, mergeStates } from './merge'
import { emptyBoard, type BoardOp, type Figure } from './types'

const fig = (id: string, extra: Partial<Figure> = {}): Figure => ({
  id, kind: 'figure', type: 'mann', x: 0, y: 0, rotation: 0, scale: 1, color: '#000',
  label: '', visible: true, locked: false, groupId: null, z: 1, ...extra,
})

describe('Zusammenführung von Operationen', () => {
  it('erstellt, ändert und löscht Elemente', () => {
    let s = applyOp(emptyBoard(), { op: 'create', entity: fig('a'), rev: { t: 1, c: 'x' } })
    s = applyOp(s, { op: 'patch', id: 'a', fields: { x: 50 }, rev: { t: 2, c: 'x' } })
    expect((s.entities.a!.data as Figure).x).toBe(50)
    s = applyOp(s, { op: 'delete', id: 'a', rev: { t: 3, c: 'x' } })
    expect(s.entities.a).toBeUndefined()
    expect(s.tombstones.a).toEqual({ t: 3, c: 'x' })
  })

  it('ist unabhängig von der Reihenfolge (kommutativ)', () => {
    const ops: BoardOp[] = [
      { op: 'create', entity: fig('a'), rev: { t: 1, c: 'A' } },
      { op: 'patch', id: 'a', fields: { x: 10 }, rev: { t: 2, c: 'A' } },
      { op: 'patch', id: 'a', fields: { x: 20 }, rev: { t: 2, c: 'B' } },
      { op: 'patch', id: 'a', fields: { label: 'Vater' }, rev: { t: 3, c: 'A' } },
    ]
    const forward = applyOps(emptyBoard(), ops)
    const backward = applyOps(emptyBoard(), [ops[0]!, ...ops.slice(1).reverse()])
    expect(listEntities(forward)).toEqual(listEntities(backward))
    // B gewinnt den Gleichstand über die Client-ID
    expect((forward.entities.a!.data as Figure).x).toBe(20)
    expect((forward.entities.a!.data as Figure).label).toBe('Vater')
  })

  it('verliert keine Änderungen an verschiedenen Feldern', () => {
    let s = applyOp(emptyBoard(), { op: 'create', entity: fig('a'), rev: { t: 1, c: 'A' } })
    s = applyOp(s, { op: 'patch', id: 'a', fields: { x: 99 }, rev: { t: 5, c: 'A' } })
    s = applyOp(s, { op: 'patch', id: 'a', fields: { label: 'Mutter' }, rev: { t: 2, c: 'B' } })
    const f = s.entities.a!.data as Figure
    expect(f.x).toBe(99)
    expect(f.label).toBe('Mutter')
  })

  it('ist idempotent', () => {
    const op: BoardOp = { op: 'create', entity: fig('a'), rev: { t: 1, c: 'A' } }
    const s1 = applyOp(emptyBoard(), op)
    expect(applyOp(s1, op)).toBe(s1)
  })

  it('verhindert die Wiederherstellung durch ältere Operationen nach dem Löschen', () => {
    let s = applyOp(emptyBoard(), { op: 'create', entity: fig('a'), rev: { t: 1, c: 'A' } })
    s = applyOp(s, { op: 'delete', id: 'a', rev: { t: 4, c: 'A' } })
    s = applyOp(s, { op: 'create', entity: fig('a'), rev: { t: 3, c: 'B' } })
    expect(s.entities.a).toBeUndefined()
    s = applyOp(s, { op: 'create', entity: fig('a'), rev: { t: 5, c: 'A' } })
    expect(s.entities.a).toBeDefined()
    expect(s.tombstones.a).toBeUndefined()
  })

  it('führt vollständige Zustände zusammen', () => {
    const base = applyOp(emptyBoard(), { op: 'create', entity: fig('a'), rev: { t: 1, c: 'A' } })
    const left = applyOp(base, { op: 'patch', id: 'a', fields: { x: 1 }, rev: { t: 2, c: 'A' } })
    const right = applyOps(base, [
      { op: 'patch', id: 'a', fields: { y: 2 }, rev: { t: 2, c: 'B' } },
      { op: 'create', entity: fig('b'), rev: { t: 3, c: 'B' } },
    ])
    const m1 = mergeStates(left, right)
    const m2 = mergeStates(right, left)
    expect(listEntities(m1)).toEqual(listEntities(m2))
    expect(m1.entities.a!.data).toMatchObject({ x: 1, y: 2 })
    expect(m1.entities.b).toBeDefined()
  })
})

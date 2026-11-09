import { describe, expect, it } from 'vitest'
import { isValidEntity, validateOps } from './validate'
import { isOpAllowed, DEFAULT_PARTICIPANT_PERMISSIONS, VIEW_ONLY_PERMISSIONS, COACH_PERMISSIONS } from './permissions'
import { newConnection, newFigure, newNote } from './commands'
import { applyOp } from './merge'
import { emptyBoard } from './types'

const rev = { t: 1, c: 'abc' }

describe('Validierung', () => {
  it('akzeptiert gültige Elemente', () => {
    const s = emptyBoard()
    expect(isValidEntity(newFigure(s, 'mann', 1, 2))).toBe(true)
    expect(isValidEntity(newNote(s, 1, 2, 'Hallo'))).toBe(true)
    expect(isValidEntity(newConnection(s, 'aaaaaaaa', 'bbbbbbbb'))).toBe(true)
  })

  it('lehnt manipulierte Elemente ab', () => {
    const f = newFigure(emptyBoard(), 'mann', 1, 2)
    expect(isValidEntity({ ...f, x: 'x' })).toBe(false)
    expect(isValidEntity({ ...f, label: 'a'.repeat(500) })).toBe(false)
    expect(isValidEntity({ ...f, extra: 1 })).toBe(false)
    expect(isValidEntity({ ...f, color: 'red; background:url(x)' })).toBe(false)
    expect(isValidEntity({ ...f, id: '../../etc' })).toBe(false)
  })

  it('prüft Operationen', () => {
    const f = newFigure(emptyBoard(), 'mann', 1, 2)
    expect(validateOps([{ op: 'create', entity: f, rev }])).not.toBeNull()
    expect(validateOps([{ op: 'patch', id: f.id, fields: { x: 3 }, rev }])).not.toBeNull()
    expect(validateOps([{ op: 'patch', id: f.id, fields: { __proto__: 3, evil: true }, rev }])).toBeNull()
    expect(validateOps([{ op: 'drop', id: f.id, rev }])).toBeNull()
    expect(validateOps([])).toBeNull()
    expect(validateOps('x')).toBeNull()
    expect(validateOps([{ op: 'delete', id: f.id, rev: { t: -1, c: 'x' } }])).toBeNull()
  })
})

describe('Berechtigungen', () => {
  const f = newFigure(emptyBoard(), 'mann', 0, 0)
  const s = applyOp(emptyBoard(), { op: 'create', entity: f, rev })

  it('Nur-Lesen darf nichts', () => {
    expect(isOpAllowed({ op: 'patch', id: f.id, fields: { x: 1 }, rev }, VIEW_ONLY_PERMISSIONS, s)).toBe(false)
    expect(isOpAllowed({ op: 'create', entity: newFigure(s, 'frau', 0, 0), rev }, VIEW_ONLY_PERMISSIONS, s)).toBe(false)
  })

  it('Teilnehmende dürfen standardmässig bewegen, aber nicht löschen oder sperren', () => {
    const p = DEFAULT_PARTICIPANT_PERMISSIONS
    expect(isOpAllowed({ op: 'patch', id: f.id, fields: { x: 1, y: 2 }, rev }, p, s)).toBe(true)
    expect(isOpAllowed({ op: 'delete', id: f.id, rev }, p, s)).toBe(false)
    expect(isOpAllowed({ op: 'patch', id: f.id, fields: { locked: true }, rev }, p, s)).toBe(false)
  })

  it('Eigene Figuren dürfen ohne Löschrecht entfernt werden', () => {
    expect(isOpAllowed({ op: 'delete', id: f.id, rev }, DEFAULT_PARTICIPANT_PERMISSIONS, s, 'abc')).toBe(true)
    expect(isOpAllowed({ op: 'delete', id: f.id, rev }, DEFAULT_PARTICIPANT_PERMISSIONS, s, 'andere')).toBe(false)
  })

  it('Gesperrte Figuren dürfen nur entsperrt werden', () => {
    const locked = applyOp(s, { op: 'patch', id: f.id, fields: { locked: true }, rev: { t: 2, c: 'x' } })
    expect(isOpAllowed({ op: 'patch', id: f.id, fields: { x: 9 }, rev }, COACH_PERMISSIONS, locked)).toBe(false)
    expect(isOpAllowed({ op: 'patch', id: f.id, fields: { locked: false }, rev }, COACH_PERMISSIONS, locked)).toBe(true)
  })
})

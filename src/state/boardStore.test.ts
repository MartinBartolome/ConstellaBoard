import { describe, expect, it } from 'vitest'
import { BoardStore } from './boardStore'
import { deleteIntents, duplicateIntents, groupIntents, expandGroups, newConnection, newFigure } from '../domain/commands'
import type { Connection, Figure } from '../domain/types'

const figures = (s: BoardStore) => Object.values(s.getState().entities).map((e) => e.data).filter((e): e is Figure => e.kind === 'figure')

describe('BoardStore', () => {
  it('fügt Figuren hinzu', () => {
    const s = new BoardStore()
    s.execute([{ op: 'create', entity: newFigure(s.getState(), 'frau', 100, 120) }])
    expect(figures(s)).toHaveLength(1)
    expect(figures(s)[0]).toMatchObject({ type: 'frau', x: 100, y: 120 })
  })

  it('verschiebt, dreht und skaliert Figuren', () => {
    const s = new BoardStore()
    const f = newFigure(s.getState(), 'mann', 0, 0)
    s.execute([{ op: 'create', entity: f }])
    s.execute([{ op: 'patch', id: f.id, fields: { x: 30, y: 40 } }])
    s.execute([{ op: 'patch', id: f.id, fields: { rotation: 90 } }])
    s.execute([{ op: 'patch', id: f.id, fields: { scale: 2 } }])
    expect(figures(s)[0]).toMatchObject({ x: 30, y: 40, rotation: 90, scale: 2 })
  })

  it('löscht Figuren samt ihrer Verbindungen', () => {
    const s = new BoardStore()
    const a = newFigure(s.getState(), 'mann', 0, 0)
    const b = newFigure(s.getState(), 'frau', 100, 0)
    s.execute([{ op: 'create', entity: a }, { op: 'create', entity: b }])
    const c = newConnection(s.getState(), a.id, b.id, 'konflikt')
    s.execute([{ op: 'create', entity: c }])
    s.execute(deleteIntents(s.getState(), [a.id]))
    const ids = Object.keys(s.getState().entities)
    expect(ids).toEqual([b.id])
  })

  it('löscht gesperrte Figuren nicht', () => {
    const s = new BoardStore()
    const a = newFigure(s.getState(), 'mann', 0, 0, { locked: true })
    s.execute([{ op: 'create', entity: a }])
    s.execute(deleteIntents(s.getState(), [a.id]))
    expect(figures(s)).toHaveLength(1)
  })

  it('macht Schritte rückgängig und stellt sie wieder her', () => {
    const s = new BoardStore()
    const a = newFigure(s.getState(), 'mann', 0, 0)
    s.execute([{ op: 'create', entity: a }])
    s.execute([{ op: 'patch', id: a.id, fields: { x: 200 } }])
    s.execute(deleteIntents(s.getState(), [a.id]))
    expect(figures(s)).toHaveLength(0)
    s.undo()
    expect(figures(s)[0]).toMatchObject({ x: 200 })
    s.undo()
    expect(figures(s)[0]).toMatchObject({ x: 0 })
    s.undo()
    expect(figures(s)).toHaveLength(0)
    expect(s.canUndo).toBe(false)
    s.redo()
    s.redo()
    expect(figures(s)[0]).toMatchObject({ x: 200 })
    s.redo()
    expect(figures(s)).toHaveLength(0)
  })

  it('verwirft die Wiederherstellen-Liste nach neuer Änderung', () => {
    const s = new BoardStore()
    const a = newFigure(s.getState(), 'mann', 0, 0)
    s.execute([{ op: 'create', entity: a }])
    s.undo()
    expect(s.canRedo).toBe(true)
    s.execute([{ op: 'create', entity: newFigure(s.getState(), 'kind-junge', 0, 0) }])
    expect(s.canRedo).toBe(false)
  })

  it('macht das Löschen mit Verbindungen vollständig rückgängig', () => {
    const s = new BoardStore()
    const a = newFigure(s.getState(), 'mann', 0, 0)
    const b = newFigure(s.getState(), 'frau', 100, 0)
    s.execute([{ op: 'create', entity: a }, { op: 'create', entity: b }])
    const c = newConnection(s.getState(), a.id, b.id)
    s.execute([{ op: 'create', entity: c }])
    s.execute(deleteIntents(s.getState(), [a.id, b.id]))
    expect(Object.keys(s.getState().entities)).toHaveLength(0)
    s.undo()
    expect(Object.keys(s.getState().entities).sort()).toEqual([a.id, b.id, c.id].sort())
  })

  it('dupliziert Figuren mit ihren gemeinsamen Verbindungen', () => {
    const s = new BoardStore()
    const a = newFigure(s.getState(), 'mann', 0, 0)
    const b = newFigure(s.getState(), 'frau', 100, 0)
    s.execute([{ op: 'create', entity: a }, { op: 'create', entity: b }])
    s.execute([{ op: 'create', entity: newConnection(s.getState(), a.id, b.id) }])
    const { intents, newIds } = duplicateIntents(s.getState(), [a.id, b.id])
    s.execute(intents)
    expect(newIds).toHaveLength(3)
    expect(figures(s)).toHaveLength(4)
    const conns = Object.values(s.getState().entities).map((e) => e.data).filter((e): e is Connection => e.kind === 'connection')
    expect(conns).toHaveLength(2)
  })

  it('gruppiert Figuren und erweitert die Auswahl', () => {
    const s = new BoardStore()
    const a = newFigure(s.getState(), 'mann', 0, 0)
    const b = newFigure(s.getState(), 'frau', 100, 0)
    const c = newFigure(s.getState(), 'kind-junge', 200, 0)
    s.execute([a, b, c].map((entity) => ({ op: 'create' as const, entity })))
    s.execute(groupIntents(s.getState(), [a.id, b.id]))
    expect([...expandGroups(s.getState(), [a.id])].sort()).toEqual([a.id, b.id].sort())
    expect([...expandGroups(s.getState(), [c.id])]).toEqual([c.id])
  })

  it('synchronisiert zwei Speicher über Operationen', () => {
    const s1 = new BoardStore(undefined, 'eins')
    const s2 = new BoardStore(undefined, 'zwei')
    s1.onLocalOps((ops) => s2.applyRemote(ops))
    s2.onLocalOps((ops) => s1.applyRemote(ops))
    const a = newFigure(s1.getState(), 'mann', 0, 0)
    s1.execute([{ op: 'create', entity: a }])
    s2.execute([{ op: 'patch', id: a.id, fields: { label: 'Grossvater' } }])
    s1.execute([{ op: 'patch', id: a.id, fields: { x: 77 } }])
    expect(s1.getState()).toEqual(s2.getState())
    expect(figures(s2)[0]).toMatchObject({ label: 'Grossvater', x: 77 })
    // Rückgängig in s2 betrifft nur die eigene Änderung
    s2.undo()
    expect(figures(s1)[0]).toMatchObject({ label: '', x: 77 })
  })

  it('respektiert Berechtigungsfilter', () => {
    const s = new BoardStore()
    s.canApply = (i) => i.op !== 'delete'
    const a = newFigure(s.getState(), 'mann', 0, 0)
    s.execute([{ op: 'create', entity: a }])
    s.execute([{ op: 'delete', id: a.id }])
    expect(figures(s)).toHaveLength(1)
  })
})

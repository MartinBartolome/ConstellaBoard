import {
  deleteIntents,
  duplicateIntents,
  groupIntents,
  newFigure,
  newNote,
  reorderIntents,
  ungroupIntents,
} from '../domain/commands'
import { listEntities } from '../domain/merge'
import type { EditorApi } from './editor'
import { entityBounds, fitRect, toBoard, unionRects, zoomAt, type Point } from './geometry'

/** Gemeinsame Aktionen für Werkzeugleisten, Kontextmenü und Tastatur. */
export function createActions(ed: EditorApi) {
  const { store, perms } = ed
  const sel = () => [...ed.selection]
  const center = (): Point =>
    toBoard(ed.viewport, { x: ed.canvasSize.width / 2, y: ed.canvasSize.width < 900 ? ed.canvasSize.height * 0.38 : ed.canvasSize.height / 2 })

  return {
    addFigure(type: string, at?: Point) {
      if (!perms.add) return
      const p = at ?? jitter(center())
      const f = newFigure(store.getState(), type, Math.round(p.x), Math.round(p.y))
      store.execute([{ op: 'create', entity: f }])
      ed.setSelection([f.id])
      ed.setTool('select')
    },
    addNote(at?: Point) {
      if (!perms.add) return
      const p = at ?? jitter(center())
      const n = newNote(store.getState(), Math.round(p.x), Math.round(p.y))
      store.execute([{ op: 'create', entity: n }])
      ed.setSelection([n.id])
      ed.setEditingNote(n.id)
      ed.setTool('select')
    },
    remove(ids = sel()) {
      if (!perms.delete || ids.length === 0) return
      const intents = deleteIntents(store.getState(), ids)
      if (intents.length === 0) {
        ed.notify('Gesperrte Elemente können nicht gelöscht werden.')
        return
      }
      store.execute(intents)
      ed.setSelection([])
    },
    duplicate(ids = sel()) {
      if (!perms.add || ids.length === 0) return
      const { intents, newIds } = duplicateIntents(store.getState(), ids)
      if (intents.length === 0) return
      store.execute(intents)
      ed.setSelection(newIds)
    },
    group(ids = sel()) {
      if (!perms.edit) return
      const intents = groupIntents(store.getState(), ids)
      if (intents.length) {
        store.execute(intents)
        ed.notify('Gruppiert')
      }
    },
    ungroup(ids = sel()) {
      if (!perms.edit) return
      const intents = ungroupIntents(store.getState(), ids)
      if (intents.length) {
        store.execute(intents)
        ed.notify('Gruppierung aufgehoben')
      }
    },
    toggleLock(ids = sel()) {
      if (!perms.lock || ids.length === 0) return
      const s = store.getState()
      const anyUnlocked = ids.some((id) => s.entities[id] && !s.entities[id]!.data.locked)
      store.execute(ids.filter((id) => s.entities[id]).map((id) => ({ op: 'patch', id, fields: { locked: anyUnlocked } })))
    },
    toggleVisible(ids = sel()) {
      if (!perms.lock || ids.length === 0) return
      const s = store.getState()
      const anyVisible = ids.some((id) => s.entities[id]?.data.visible)
      store.execute(ids.filter((id) => s.entities[id]).map((id) => ({ op: 'patch', id, fields: { visible: !anyVisible } })))
    },
    rotateBy(deg: number, ids = sel()) {
      if (!perms.edit) return
      const s = store.getState()
      const intents = ids
        .map((id) => s.entities[id]?.data)
        .filter((e) => e && e.kind !== 'connection' && !e.locked)
        .map((e) => {
          const r = (((e as { rotation: number }).rotation + deg) % 360 + 360) % 360
          return { op: 'patch' as const, id: e!.id, fields: { rotation: r } }
        })
      if (intents.length) store.execute(intents)
    },
    reorder(where: 'front' | 'back', ids = sel()) {
      if (!perms.edit) return
      const intents = reorderIntents(store.getState(), ids, where)
      if (intents.length) store.execute(intents)
    },
    nudge(dx: number, dy: number, ids = sel()) {
      if (!perms.move) return
      const s = store.getState()
      const intents = ids
        .map((id) => s.entities[id]?.data)
        .filter((e) => e && e.kind !== 'connection' && !e.locked)
        .map((e) => {
          const m = e as { x: number; y: number; id: string }
          return { op: 'patch' as const, id: m.id, fields: { x: m.x + dx, y: m.y + dy } }
        })
      if (intents.length) store.execute(intents)
    },
    selectAll() {
      const s = store.getState()
      ed.setSelection(listEntities(s).filter((e) => perms.seeHidden || e.visible).map((e) => e.id))
    },
    undo() {
      store.undo()
    },
    redo() {
      store.redo()
    },
    zoomBy(f: number) {
      ed.setViewport((v) => zoomAt(v, { x: ed.canvasSize.width / 2, y: ed.canvasSize.height / 2 }, f))
    },
    zoomReset() {
      ed.setViewport((v) => zoomAt(v, { x: ed.canvasSize.width / 2, y: ed.canvasSize.height / 2 }, 1 / v.k))
    },
    fit() {
      const s = store.getState()
      const rects = listEntities(s)
        .map((e) => entityBounds(e, s))
        .filter((r): r is NonNullable<typeof r> => !!r)
      const u = unionRects(rects)
      if (!u) {
        ed.setViewport({ x: ed.canvasSize.width / 2, y: ed.canvasSize.height / 2, k: 1 })
        return
      }
      ed.setViewport(fitRect(u, ed.canvasSize.width, ed.canvasSize.height))
    },
  }
}

export type Actions = ReturnType<typeof createActions>

function jitter(p: Point): Point {
  return { x: p.x + (Math.random() - 0.5) * 60, y: p.y + (Math.random() - 0.5) * 60 }
}

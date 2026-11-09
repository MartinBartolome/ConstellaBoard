import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useBoardState, useEditor } from './editor'
import {
  angleDeg,
  dist,
  entityBounds,
  normRect,
  rectIntersects,
  toBoard,
  unionRects,
  zoomAt,
  type Point,
  type Rect,
  type Viewport,
} from './geometry'
import { FigureView } from './FigureView'
import { NoteView } from './NoteView'
import { ConnectionView, ConnectionPreview } from './ConnectionView'
import { SelectionOverlay } from './SelectionOverlay'
import { clampScale, expandGroups, newConnection, normalizeAngle } from '../domain/commands'
import type { Intent } from '../domain/intents'
import type { BoardEntity, Connection, Figure, Note } from '../domain/types'
import { listEntities } from '../domain/merge'

type Movable = Figure | Note

type Gesture =
  | { kind: 'pan'; start: Point; startView: Viewport }
  | { kind: 'drag'; start: Point; starts: Map<string, Point>; moved: boolean; hitId: string; wasSelected: boolean; additive: boolean }
  | { kind: 'rotate'; id: string; center: Point; startAngle: number; startRotation: number; current: number }
  | { kind: 'scale'; id: string; center: Point; startDist: number; startScale: number; current: number }
  | { kind: 'marquee'; start: Point; current: Point; additive: boolean; base: Set<string> }
  | { kind: 'pinch'; startDist: number; startMid: Point; startView: Viewport }

const DRAG_THRESHOLD = 4
const LONG_PRESS_MS = 550

/**
 * Die Zeichenfläche: SVG mit Verschieben/Zoomen, Auswahl, Ziehen, Drehen,
 * Skalieren und Verbinden. Bedienbar mit Maus, Stift und Touch (inkl.
 * Zwei-Finger-Zoom). Alle Gesten laufen über Pointer Events.
 */
export function Canvas({ overlay, onDropTemplate }: { overlay?: (v: Viewport) => ReactNode; onDropTemplate?: (type: string, p: Point) => void }) {
  const ed = useEditor()
  const { store, viewport, setViewport, perms, selection, setSelection, tool } = ed
  const state = useBoardState(store)
  const svgRef = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const pointers = useRef(new Map<number, Point>())
  const longPress = useRef<number | null>(null)
  const lastTap = useRef<{ id: string | null; t: number }>({ id: null, t: 0 })
  const spaceDown = useRef(false)
  const [marquee, setMarquee] = useState<Rect | null>(null)
  const [pointerBoard, setPointerBoard] = useState<Point | null>(null)
  const [panning, setPanning] = useState(false)

  // Grösse der Fläche beobachten
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => ed.setCanvasSize({ width: el.clientWidth, height: el.clientHeight }))
    ro.observe(el)
    ed.setCanvasSize({ width: el.clientWidth, height: el.clientHeight })
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Leertaste = temporäres Verschieben
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e)) spaceDown.current = true
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceDown.current = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const local = useCallback((e: { clientX: number; clientY: number }): Point => {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }, [])

  // Mausrad / Trackpad
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const p = local(e)
      const trackpadPan = !e.ctrlKey && !e.metaKey && (e.deltaX !== 0 || e.shiftKey)
      if (trackpadPan) {
        setViewport((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
      } else {
        const scale = e.deltaMode === 1 ? 0.05 : e.ctrlKey ? 0.01 : 0.0025
        setViewport((v) => zoomAt(v, p, Math.exp(-e.deltaY * scale)))
      }
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [local, setViewport])

  const entities = useMemo(() => listEntities(state), [state])
  const visibleEntities = useMemo(
    () => (perms.seeHidden ? entities : entities.filter((e) => e.visible)),
    [entities, perms.seeHidden],
  )
  const connections = visibleEntities.filter((e): e is Connection => e.kind === 'connection')
  const nodes = visibleEntities.filter((e): e is Movable => e.kind !== 'connection')

  const clearLongPress = () => {
    if (longPress.current !== null) {
      clearTimeout(longPress.current)
      longPress.current = null
    }
  }

  const entityAt = (target: EventTarget | null): BoardEntity | null => {
    const el = (target as Element | null)?.closest?.('[data-entity]')
    const id = el?.getAttribute('data-entity')
    return id ? (state.entities[id]?.data ?? null) : null
  }

  const commitGesture = () => {
    const g = gesture.current
    gesture.current = null
    if (!g) return
    if (g.kind === 'drag' && g.moved) {
      const cur = store.getState()
      const forward: Intent[] = []
      const back: Intent[] = []
      for (const [id, p] of g.starts) {
        const e = cur.entities[id]?.data as Movable | undefined
        if (!e) continue
        forward.push({ op: 'patch', id, fields: { x: e.x, y: e.y } })
        back.push({ op: 'patch', id, fields: { x: p.x, y: p.y } })
      }
      store.pushHistory({ do: forward, undo: back })
    } else if (g.kind === 'rotate' && g.current !== g.startRotation) {
      store.pushHistory({
        do: [{ op: 'patch', id: g.id, fields: { rotation: g.current } }],
        undo: [{ op: 'patch', id: g.id, fields: { rotation: g.startRotation } }],
      })
    } else if (g.kind === 'scale' && g.current !== g.startScale) {
      store.pushHistory({
        do: [{ op: 'patch', id: g.id, fields: { scale: g.current } }],
        undo: [{ op: 'patch', id: g.id, fields: { scale: g.startScale } }],
      })
    } else if (g.kind === 'marquee') {
      setMarquee(null)
    }
    setPanning(false)
  }

  const startPinch = () => {
    const pts = [...pointers.current.values()]
    if (pts.length < 2) return
    // laufende Geste sauber abschliessen
    commitGesture()
    clearLongPress()
    const [a, b] = pts as [Point, Point]
    gesture.current = { kind: 'pinch', startDist: dist(a, b), startMid: mid(a, b), startView: viewport }
  }

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button === 2) return // Kontextmenü separat
    const p = local(e)
    pointers.current.set(e.pointerId, p)
    svgRef.current?.setPointerCapture(e.pointerId)
    ed.setContextMenu(null)
    if (pointers.current.size === 2) {
      startPinch()
      return
    }
    if (pointers.current.size > 2) return

    const bp = toBoard(viewport, p)
    const handle = (e.target as Element).closest?.('[data-handle]')
    if (handle) {
      const id = handle.getAttribute('data-for')!
      const ent = state.entities[id]?.data as Movable | undefined
      if (!ent) return
      const center = { x: ent.x, y: ent.y }
      if (handle.getAttribute('data-handle') === 'rotate')
        gesture.current = { kind: 'rotate', id, center, startAngle: angleDeg(center, bp), startRotation: ent.rotation, current: ent.rotation }
      else gesture.current = { kind: 'scale', id, center, startDist: Math.max(dist(center, bp), 1), startScale: ent.scale, current: ent.scale }
      return
    }

    const hit = entityAt(e.target)
    const wantsPan = e.button === 1 || tool === 'hand' || spaceDown.current

    if (wantsPan || (!hit && e.pointerType === 'touch' && tool !== 'connect')) {
      gesture.current = { kind: 'pan', start: p, startView: viewport }
      setPanning(true)
      if (!hit && e.pointerType === 'touch') armLongPress(e, null, bp)
      return
    }

    if (tool === 'connect') {
      if (!hit || hit.kind === 'connection') {
        ed.setConnectFrom(null)
        if (!hit) {
          gesture.current = { kind: 'pan', start: p, startView: viewport }
          setPanning(true)
        }
        return
      }
      if (!ed.connectFrom) {
        ed.setConnectFrom(hit.id)
        setSelection([hit.id])
      } else if (ed.connectFrom !== hit.id) {
        if (perms.connect) {
          const c = newConnection(state, ed.connectFrom, hit.id, ed.connectType)
          store.execute([{ op: 'create', entity: c }])
          setSelection([c.id])
        }
        ed.setConnectFrom(null)
      }
      return
    }

    if (hit) {
      // Doppeltipp erkennen (funktioniert auch auf Touch-Geräten)
      const now = performance.now()
      const isDouble = lastTap.current.id === hit.id && now - lastTap.current.t < 350
      lastTap.current = { id: hit.id, t: now }
      if (isDouble) {
        onDoubleActivate(hit)
        return
      }

      const additive = e.shiftKey || e.metaKey || e.ctrlKey
      const wasSelected = selection.has(hit.id)
      let next: Set<string>
      if (additive) {
        next = new Set(selection)
        const group = expandGroups(state, [hit.id])
        if (wasSelected) for (const id of group) next.delete(id)
        else for (const id of group) next.add(id)
      } else if (wasSelected) {
        next = new Set(selection)
      } else {
        next = expandGroups(state, [hit.id])
      }
      setSelection(next)
      armLongPress(e, hit.id, bp)
      if (hit.kind === 'connection' || !perms.move) return
      const starts = new Map<string, Point>()
      for (const id of next) {
        const ent = state.entities[id]?.data
        if (ent && ent.kind !== 'connection' && !ent.locked) starts.set(id, { x: ent.x, y: ent.y })
      }
      if (starts.size > 0) gesture.current = { kind: 'drag', start: bp, starts, moved: false, hitId: hit.id, wasSelected, additive }
      return
    }

    // Leere Fläche: Auswahlrechteck
    const additive = e.shiftKey || e.metaKey || e.ctrlKey
    if (!additive) setSelection([])
    gesture.current = { kind: 'marquee', start: bp, current: bp, additive, base: new Set(additive ? selection : []) }
  }

  const armLongPress = (e: React.PointerEvent, id: string | null, bp: Point) => {
    clearLongPress()
    if (e.pointerType === 'mouse') return
    const cx = e.clientX
    const cy = e.clientY
    longPress.current = window.setTimeout(() => {
      longPress.current = null
      const g = gesture.current
      if (g && g.kind === 'drag' && g.moved) return
      gesture.current = null
      setPanning(false)
      if (id) setSelection(expandGroups(state, [id]))
      ed.setContextMenu({ x: cx, y: cy, id, boardX: bp.x, boardY: bp.y })
    }, LONG_PRESS_MS)
  }

  const onDoubleActivate = (hit: BoardEntity) => {
    setSelection([hit.id])
    if (hit.kind === 'note') {
      if (perms.edit && !hit.locked) ed.setEditingNote(hit.id)
    } else ed.requestLabelFocus()
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = local(e)
    const bp = toBoard(viewport, p)
    if (e.pointerType !== 'touch') {
      setPointerBoard(bp)
      ed.onPointerBoard?.(bp)
    }
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, p)
    const g = gesture.current
    if (!g) return

    switch (g.kind) {
      case 'pinch': {
        const pts = [...pointers.current.values()]
        if (pts.length < 2) return
        const [a, b] = pts as [Point, Point]
        const m = mid(a, b)
        const factor = dist(a, b) / g.startDist
        const v0 = g.startView
        const zoomed = zoomAt(v0, g.startMid, factor)
        setViewport({ ...zoomed, x: zoomed.x + (m.x - g.startMid.x), y: zoomed.y + (m.y - g.startMid.y) })
        break
      }
      case 'pan': {
        const dx = p.x - g.start.x
        const dy = p.y - g.start.y
        if (Math.hypot(dx, dy) > DRAG_THRESHOLD) clearLongPress()
        setViewport({ ...g.startView, x: g.startView.x + dx, y: g.startView.y + dy })
        break
      }
      case 'drag': {
        const dx = bp.x - g.start.x
        const dy = bp.y - g.start.y
        if (!g.moved && Math.hypot(dx, dy) * viewport.k < DRAG_THRESHOLD) return
        g.moved = true
        clearLongPress()
        const intents: Intent[] = []
        for (const [id, s] of g.starts) intents.push({ op: 'patch', id, fields: { x: round(s.x + dx), y: round(s.y + dy) } })
        store.execute(intents, { history: false })
        break
      }
      case 'rotate': {
        let r = normalizeAngle(g.startRotation + angleDeg(g.center, bp) - g.startAngle)
        if (e.shiftKey) r = Math.round(r / 15) * 15
        else {
          const snap = Math.round(r / 45) * 45
          if (Math.abs(snap - r) < 4) r = snap
        }
        r = normalizeAngle(round(r))
        g.current = r
        store.execute([{ op: 'patch', id: g.id, fields: { rotation: r } }], { history: false })
        break
      }
      case 'scale': {
        const s = clampScale(round(g.startScale * (dist(g.center, bp) / g.startDist), 100))
        g.current = s
        store.execute([{ op: 'patch', id: g.id, fields: { scale: s } }], { history: false })
        break
      }
      case 'marquee': {
        g.current = bp
        const r = normRect(g.start, bp)
        setMarquee(r)
        const next = new Set(g.base)
        for (const ent of visibleEntities) {
          const b = entityBounds(ent, state)
          if (b && rectIntersects(r, b)) next.add(ent.id)
        }
        setSelection(expandGroups(state, next))
        break
      }
    }
  }

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId)
    clearLongPress()
    const g = gesture.current
    if (g?.kind === 'pinch') {
      if (pointers.current.size < 2) gesture.current = null
      return
    }
    if (g?.kind === 'drag' && !g.moved && g.wasSelected && !g.additive) {
      // Klick auf bereits gewähltes Element: nur dieses (inkl. Gruppe) auswählen
      setSelection(expandGroups(state, [g.hitId]))
    }
    commitGesture()
  }

  const onContextMenu = (e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault()
    const hit = entityAt(e.target)
    const bp = toBoard(viewport, local(e))
    if (hit && !selection.has(hit.id)) setSelection(expandGroups(state, [hit.id]))
    ed.setContextMenu({ x: e.clientX, y: e.clientY, id: hit?.id ?? null, boardX: bp.x, boardY: bp.y })
  }

  // Drop aus der Bibliothek (HTML5 Drag-and-drop für Maus)
  const onDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-constella-figure')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }
  const onDrop = (e: React.DragEvent) => {
    const type = e.dataTransfer.getData('application/x-constella-figure')
    if (!type) return
    e.preventDefault()
    onDropTemplate?.(type, toBoard(viewport, local(e)))
  }

  const connectSource = ed.connectFrom ? state.entities[ed.connectFrom]?.data : undefined
  const selectedBounds = useMemo(() => {
    const rects: Rect[] = []
    for (const id of selection) {
      const ent = state.entities[id]?.data
      if (ent && ent.kind !== 'connection') {
        const b = entityBounds(ent, state)
        if (b) rects.push(b)
      }
    }
    return unionRects(rects)
  }, [selection, state])

  const cursor = panning ? 'grabbing' : tool === 'hand' ? 'grab' : tool === 'connect' ? 'crosshair' : 'default'
  const gridSize = 40 * viewport.k
  const showGrid = gridSize > 12

  return (
    <div
      ref={wrapRef}
      className="board-grid absolute inset-0 overflow-hidden"
      style={
        showGrid
          ? {
              backgroundImage: 'radial-gradient(circle, #ddd3c4 1px, transparent 1.2px)',
              backgroundSize: `${gridSize}px ${gridSize}px`,
              backgroundPosition: `${viewport.x}px ${viewport.y}px`,
            }
          : undefined
      }
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <svg
        ref={svgRef}
        className="board-surface absolute inset-0 h-full w-full"
        style={{ cursor }}
        role="application"
        aria-label="Systembrett"
        data-testid="board"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={(e) => {
          if (e.pointerType !== 'touch') {
            setPointerBoard(null)
            ed.onPointerBoard?.(null)
          }
        }}
        onContextMenu={onContextMenu}
      >
        <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.k})`}>
          {connections.map((c) => (
            <ConnectionView
              key={c.id}
              c={c}
              from={state.entities[c.from]?.data}
              to={state.entities[c.to]?.data}
              selected={selection.has(c.id)}
              k={viewport.k}
            />
          ))}
          {connectSource && pointerBoard && tool === 'connect' && (
            <ConnectionPreview from={connectSource} to={pointerBoard} type={ed.connectType} />
          )}
          {nodes.map((n) =>
            n.kind === 'figure' ? (
              <FigureView key={n.id} f={n} selected={selection.has(n.id)} connectSource={ed.connectFrom === n.id} />
            ) : (
              <NoteView key={n.id} n={n} selected={selection.has(n.id)} editing={ed.editingNote === n.id} />
            ),
          )}
          <SelectionOverlay bounds={selectedBounds} k={viewport.k} state={state} />
          {marquee && (
            <rect
              x={marquee.x}
              y={marquee.y}
              width={marquee.w}
              height={marquee.h}
              fill="rgb(91 122 90 / 0.08)"
              stroke="#5b7a5a"
              strokeWidth={1 / viewport.k}
              strokeDasharray={`${4 / viewport.k} ${3 / viewport.k}`}
            />
          )}
        </g>
        {overlay?.(viewport)}
      </svg>
    </div>
  )
}

function mid(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function round(v: number, f = 10): number {
  return Math.round(v * f) / f
}

export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  if (!t) return false
  return t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT'
}

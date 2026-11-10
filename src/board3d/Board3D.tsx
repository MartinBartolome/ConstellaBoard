import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useBoardState, useEditor, type EditorApi } from '../board/editor'
import { noteSize } from '../board/geometry'
import { Icon } from '../components/Icon'
import { expandGroups, newConnection, normalizeAngle } from '../domain/commands'
import type { Intent } from '../domain/intents'
import { getTemplate } from '../domain/library'
import { listEntities } from '../domain/merge'
import type { BoardEntity, BoardState, Connection, Figure, Note } from '../domain/types'
import { Connection3D } from './Connection3D'
import { FigureModel, figureHeight } from './Figure3D'
import { WORLD_SCALE, rotationTowards, toBoardPoint, yawFromRotation, type BoardPoint } from './coords'
import { getBoardStyle, getEnvironment, useViewSettings } from './scenery'
import { Environment3D, Systembrett, type BoardRect } from './Scenery3D'
import { SceneryPanel } from './SceneryPanel'
import { SpeechBubble } from './SpeechBubble'

/** Von aussen nutzbare Funktionen der 3D-Ansicht (z. B. Ablegen aus der Bibliothek). */
export interface Board3DHandle {
  /** Bildschirmpunkt → Brettpunkt auf der Brettebene */
  pick(clientX: number, clientY: number): BoardPoint | null
  /** Brettpunkt in der Bildmitte */
  center(): BoardPoint
  resetView(): void
  topView(): void
  /** Brettpunkt (auf Höhe h in Welt-Einheiten) → Bildschirmpunkt; für Tests und Hinweise */
  screenOf(p: BoardPoint, h?: number): { x: number; y: number }
}

type Movable = Figure | Note

type Gesture =
  | {
      kind: 'drag'
      pointerId: number
      sx: number
      sy: number
      start: BoardPoint
      starts: Map<string, BoardPoint>
      moved: boolean
      hitId: string
      wasSelected: boolean
      additive: boolean
    }
  | { kind: 'rotate'; pointerId: number; id: string; center: BoardPoint; startAngle: number; startRotation: number; current: number }

const DRAG_THRESHOLD = 5

/** Schwächere Geräte (Handy, Tablet): kleinere Texturen und Schattenkarten. */
function detectLowPower(): boolean {
  if (typeof window === 'undefined') return false
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  return coarse || Math.min(window.screen.width, window.screen.height) < 700
}

/** WebGL ohne Grafikkarte (z. B. SwiftShader, llvmpipe): sparsam rendern. */
export function softwareRendering(): boolean {
  if (typeof document === 'undefined') return false
  // ?hq: volle Qualität erzwingen (Screenshots, Vergleiche)
  if (new URLSearchParams(window.location.search).has('hq')) return false
  try {
    const gl = document.createElement('canvas').getContext('webgl')
    if (!gl) return true
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const name = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return /swiftshader|llvmpipe|software|softpipe/i.test(name)
  } catch {
    return false
  }
}

/**
 * Umschaltbare 3D-Ansicht des Systembretts. Nutzt dieselben Daten wie die
 * 2D-Fläche: Ziehen und Drehen schreibt Brett-Koordinaten in den Store, die
 * Synchronisation mit anderen Teilnehmenden bleibt unverändert.
 *
 * Bedienung: ein Finger / linke Maustaste auf freier Fläche dreht die Kamera,
 * zwei Finger zoomen und verschieben, Figuren lassen sich direkt greifen.
 */
export default function Board3D({ handleRef }: { handleRef: RefObject<Board3DHandle | null> }) {
  const ed = useEditor()
  const state = useBoardState(ed.store)
  const entities = useMemo(() => listEntities(state), [state])
  const visible = useMemo(() => (ed.perms.seeHidden ? entities : entities.filter((e) => e.visible)), [entities, ed.perms.seeHidden])
  const figureCount = visible.filter((e) => e.kind === 'figure').length
  const settings = useViewSettings()
  const env = getEnvironment(settings.environment)
  // Ohne Grafikkarte rechnet die CPU jedes Pixel: kleinere Auflösung und Schatten
  const software = useMemo(softwareRendering, [])
  const lowPower = useMemo(() => software || detectLowPower(), [software])
  const [panelOpen, setPanelOpen] = useState(false)

  return (
    <div
      className="absolute inset-0 isolate overflow-hidden"
      data-testid="board-3d"
      data-figures={figureCount}
      data-environment={env.id}
      data-board={getBoardStyle(settings.board).id}
      style={{ background: env.color }}
    >
      <Canvas
        shadows
        dpr={software ? 0.6 : lowPower ? [1, 1.5] : [1, 2]}
        frameloop="demand"
        camera={{ fov: 42, near: 0.1, far: 2500, position: [0, 18, 16] }}
        gl={{ antialias: true, preserveDrawingBuffer: false, toneMapping: THREE.AgXToneMapping, toneMappingExposure: 0.95 }}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Systembrett in 3D"
      >
        <Scene ed={ed} state={state} visible={visible} handleRef={handleRef} lowPower={lowPower} software={software} />
      </Canvas>
      <ViewButtons handleRef={handleRef} onScenery={() => setPanelOpen((v) => !v)} sceneryOpen={panelOpen} />
      {panelOpen && <SceneryPanel onClose={() => setPanelOpen(false)} />}
    </div>
  )
}

function ViewButtons({ handleRef, onScenery, sceneryOpen }: { handleRef: RefObject<Board3DHandle | null>; onScenery: () => void; sceneryOpen: boolean }) {
  return (
    <div className="panel absolute right-3 bottom-4 z-10 flex items-center gap-0.5 p-1" data-testid="view3d-controls">
      <button
        className={`flex h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-medium ${sceneryOpen ? 'bg-moss/15 text-moss' : 'text-ink-2 hover:bg-paper-2'}`}
        onClick={onScenery}
        aria-expanded={sceneryOpen}
        data-testid="scenery-button"
        title="Umgebung und Brett wählen"
      >
        <Icon name="landscape" size={17} />
        Umgebung
      </button>
      <button className="icon-btn" onClick={() => handleRef.current?.topView()} aria-label="Draufsicht" title="Draufsicht">
        <Icon name="fit" />
      </button>
      <button
        className="h-11 rounded-xl px-3 text-xs font-medium text-ink-2 hover:bg-paper-2"
        onClick={() => handleRef.current?.resetView()}
        title="Kamera zurücksetzen"
      >
        <span className="hidden sm:inline">Ansicht zurücksetzen</span>
        <span className="sm:hidden">Zurücksetzen</span>
      </button>
    </div>
  )
}

/** Brettgrösse: mindestens ein handliches Brett, wächst mit den Figuren mit. */
const MIN_BOARD = { w: 26, d: 18 }
const BOARD_MARGIN = 2.5
const BOARD_STEP = 2

export function boardRectOf(entities: BoardEntity[]): BoardRect {
  let x1 = -MIN_BOARD.w / 2
  let x2 = MIN_BOARD.w / 2
  let z1 = -MIN_BOARD.d / 2
  let z2 = MIN_BOARD.d / 2
  for (const e of entities) {
    if (e.kind === 'connection') continue
    const pad = e.kind === 'figure' ? getTemplate(e.type).size * e.scale * WORLD_SCALE + BOARD_MARGIN : BOARD_MARGIN + 3
    x1 = Math.min(x1, e.x * WORLD_SCALE - pad)
    x2 = Math.max(x2, e.x * WORLD_SCALE + pad)
    z1 = Math.min(z1, e.y * WORLD_SCALE - pad)
    z2 = Math.max(z2, e.y * WORLD_SCALE + pad)
  }
  const snap = (v: number, up: boolean) => (up ? Math.ceil(v / BOARD_STEP) : Math.floor(v / BOARD_STEP)) * BOARD_STEP
  x1 = snap(x1, false)
  x2 = snap(x2, true)
  z1 = snap(z1, false)
  z2 = snap(z2, true)
  return { cx: (x1 + x2) / 2, cz: (z1 + z2) / 2, w: x2 - x1, d: z2 - z1 }
}

function Scene({
  ed,
  state,
  visible,
  handleRef,
  lowPower,
  software,
}: {
  ed: EditorApi
  state: BoardState
  visible: BoardEntity[]
  handleRef: RefObject<Board3DHandle | null>
  lowPower: boolean
  software: boolean
}) {
  const { camera, gl, invalidate } = useThree()
  // drei <Html> verliert seinen Inhalt, wenn es vor dem Verbinden der Ereignisse
  // eingehängt wird (Zielelement wechselt). Darum Beschriftungen erst danach zeigen.
  const htmlReady = !!useThree((s) => s.events.connected)
  const controls = useRef<OrbitControlsImpl>(null)
  const gesture = useRef<Gesture | null>(null)
  const lastTap = useRef<{ id: string | null; t: number }>({ id: null, t: 0 })
  /** Wurde die aktuelle Berührung auf der freien Fläche begonnen? */
  const groundDown = useRef(false)
  const { store, perms, selection, setSelection, tool } = ed
  const settings = useViewSettings()
  const env = getEnvironment(settings.environment)
  const boardStyle = getBoardStyle(settings.board)
  // Alle Elemente (auch ausgeblendete) bestimmen die Brettgrösse, damit das Brett nicht springt
  const rectRaw = useMemo(() => boardRectOf(listEntities(state)), [state])
  const rectKey = `${rectRaw.cx}:${rectRaw.cz}:${rectRaw.w}:${rectRaw.d}`
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rect = useMemo(() => rectRaw, [rectKey])

  const helpers = useMemo(
    () => ({ raycaster: new THREE.Raycaster(), ndc: new THREE.Vector2(), plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit: new THREE.Vector3() }),
    [],
  )

  const pick = useCallback(
    (clientX: number, clientY: number): BoardPoint | null => {
      const r = gl.domElement.getBoundingClientRect()
      if (r.width === 0) return null
      helpers.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
      helpers.raycaster.setFromCamera(helpers.ndc, camera)
      const p = helpers.raycaster.ray.intersectPlane(helpers.plane, helpers.hit)
      return p ? toBoardPoint(p.x, p.z) : null
    },
    [camera, gl, helpers],
  )

  const frame = useCallback(
    (mode: 'perspective' | 'top') => {
      // Ganzes Brett ins Bild holen
      const b = { cx: rect.cx, cz: rect.cz, size: Math.max(rect.w, rect.d * 1.2) * 0.82 }
      // Hochformat (Handy): so weit weg, dass das Brett (fast) in die Breite passt
      const aspect = Math.max(1, gl.domElement.clientWidth) / Math.max(1, gl.domElement.clientHeight)
      const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 42
      const tanH = Math.tan((fov * Math.PI) / 360) * aspect
      const d = Math.max(b.size * 1.05, (rect.w * 0.56) / tanH / 1.1)
      // Perspektive: flacher Blick, damit hinter dem Brett die Landschaft sichtbar wird
      // Hochformat: steiler von oben, damit das Brett den Bildschirm besser füllt
      const portrait = aspect < 1
      const tz = mode === 'top' || portrait ? b.cz : b.cz - b.size * 0.14
      if (mode === 'top') camera.position.set(b.cx, d * 1.45, b.cz + 0.001)
      // etwas Abstand: Tischkante und Raum sollen sichtbar bleiben
      else camera.position.set(b.cx, d * (portrait ? 0.95 : 0.56), b.cz + d * (portrait ? 0.8 : 1.12))
      controls.current?.target.set(b.cx, 0, tz)
      camera.lookAt(b.cx, 0, tz)
      controls.current?.update()
      invalidate()
    },
    [camera, gl, invalidate, rect],
  )

  // Beim Öffnen einmal alles ins Bild holen
  const framed = useRef(false)
  const viewport = useThree((s) => s.size)
  useEffect(() => {
    // erst, wenn die Grösse der Zeichenfläche bekannt ist (Hochformat!)
    if (framed.current || viewport.width < 2 || viewport.height < 2) return
    framed.current = true
    frame('perspective')
  }, [frame, viewport.width, viewport.height])

  useEffect(() => {
    handleRef.current = {
      pick,
      center: () => {
        const t = controls.current?.target
        return t ? toBoardPoint(t.x, t.z) : { x: 0, y: 0 }
      },
      resetView: () => frame('perspective'),
      topView: () => frame('top'),
      screenOf: (p, h = 0) => {
        const v = new THREE.Vector3(p.x * WORLD_SCALE, h, p.y * WORLD_SCALE).project(camera)
        const r = gl.domElement.getBoundingClientRect()
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }
      },
    }
    // Für automatisierte Tests am DOM-Element erreichbar
    const host = gl.domElement.closest('[data-testid="board-3d"]') as (HTMLElement & { board3d?: Board3DHandle }) | null
    if (host) host.board3d = handleRef.current
    return () => {
      handleRef.current = null
      if (host) delete host.board3d
    }
  }, [pick, frame, handleRef, camera, gl])

  // Gesten (Ziehen, Drehen) laufen über Fenster-Ereignisse, damit sie auch
  // ausserhalb der Figur weitergehen.
  const endGesture = useCallback(() => {
    const g = gesture.current
    gesture.current = null
    if (controls.current) controls.current.enabled = true
    if (!g) return
    if (g.kind === 'drag') {
      if (g.moved) {
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
      } else if (g.wasSelected && !g.additive) {
        setSelection(expandGroups(store.getState(), [g.hitId]))
      }
    } else if (g.kind === 'rotate' && g.current !== g.startRotation) {
      store.pushHistory({
        do: [{ op: 'patch', id: g.id, fields: { rotation: g.current } }],
        undo: [{ op: 'patch', id: g.id, fields: { rotation: g.startRotation } }],
      })
    }
  }, [store, setSelection])

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const g = gesture.current
      if (!g || e.pointerId !== g.pointerId) return
      const p = pick(e.clientX, e.clientY)
      if (!p) return
      if (g.kind === 'drag') {
        if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < DRAG_THRESHOLD) return
        g.moved = true
        const dx = p.x - g.start.x
        const dy = p.y - g.start.y
        const intents: Intent[] = []
        for (const [id, s] of g.starts) intents.push({ op: 'patch', id, fields: { x: round(s.x + dx), y: round(s.y + dy) } })
        store.execute(intents, { history: false })
      } else {
        let r = normalizeAngle(g.startRotation + rotationTowards(g.center, p) - g.startAngle)
        if (e.shiftKey) r = Math.round(r / 15) * 15
        else {
          const snap = Math.round(r / 45) * 45
          if (Math.abs(snap - r) < 5) r = snap
        }
        r = normalizeAngle(Math.round(r))
        g.current = r
        store.execute([{ op: 'patch', id: g.id, fields: { rotation: r } }], { history: false })
      }
    }
    const up = (e: PointerEvent) => {
      if (gesture.current && e.pointerId === gesture.current.pointerId) endGesture()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [pick, store, endGesture])

  const onEntityDown = (hit: BoardEntity, e: ThreeEvent<PointerEvent>) => {
    const ne = e.nativeEvent
    if (ne.button === 2) return
    e.stopPropagation()
    groundDown.current = false
    ed.setContextMenu(null)

    if (tool === 'connect') {
      if (hit.kind === 'connection') {
        ed.setConnectFrom(null)
        setSelection([hit.id])
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

    const now = performance.now()
    const isDouble = lastTap.current.id === hit.id && now - lastTap.current.t < 350
    lastTap.current = { id: hit.id, t: now }
    if (isDouble) {
      setSelection([hit.id])
      if (hit.kind === 'note') {
        if (perms.edit && !hit.locked) ed.setEditingNote(hit.id)
      } else ed.requestLabelFocus()
      return
    }

    const additive = ne.shiftKey || ne.metaKey || ne.ctrlKey
    const wasSelected = selection.has(hit.id)
    let next: Set<string>
    if (additive) {
      next = new Set(selection)
      const group = expandGroups(state, [hit.id])
      if (wasSelected) for (const id of group) next.delete(id)
      else for (const id of group) next.add(id)
    } else if (wasSelected) next = new Set(selection)
    else next = expandGroups(state, [hit.id])
    setSelection(next)
    if (hit.kind === 'connection' || !perms.move) return
    const start = pick(ne.clientX, ne.clientY)
    if (!start) return
    const starts = new Map<string, BoardPoint>()
    for (const id of next) {
      const ent = state.entities[id]?.data
      if (ent && ent.kind !== 'connection' && !ent.locked) starts.set(id, { x: ent.x, y: ent.y })
    }
    if (starts.size === 0) return
    gesture.current = {
      kind: 'drag',
      pointerId: ne.pointerId,
      sx: ne.clientX,
      sy: ne.clientY,
      start,
      starts,
      moved: false,
      hitId: hit.id,
      wasSelected,
      additive,
    }
    if (controls.current) controls.current.enabled = false
  }

  const onRotateDown = (f: Figure, e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    groundDown.current = false
    const p = pick(e.nativeEvent.clientX, e.nativeEvent.clientY)
    if (!p) return
    const center = { x: f.x, y: f.y }
    gesture.current = {
      kind: 'rotate',
      pointerId: e.nativeEvent.pointerId,
      id: f.id,
      center,
      startAngle: rotationTowards(center, p),
      startRotation: f.rotation,
      current: f.rotation,
    }
    if (controls.current) controls.current.enabled = false
  }

  const onEntityContext = (hit: BoardEntity, e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    e.nativeEvent.preventDefault()
    if (!selection.has(hit.id)) setSelection(expandGroups(state, [hit.id]))
    const bp = pick(e.nativeEvent.clientX, e.nativeEvent.clientY) ?? { x: 0, y: 0 }
    ed.setContextMenu({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY, id: hit.id, boardX: bp.x, boardY: bp.y })
  }

  const connections = visible.filter((e): e is Connection => e.kind === 'connection')
  const figures = visible.filter((e): e is Figure => e.kind === 'figure')
  const notes = visible.filter((e): e is Note => e.kind === 'note')
  const single = selection.size === 1 ? state.entities[[...selection][0]!]?.data : undefined
  const rotatable = single?.kind === 'figure' && perms.edit && !single.locked && tool !== 'connect' ? single : null

  const hand = tool === 'hand'

  return (
    <>
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping={false}
        minDistance={3}
        maxDistance={env.setting?.kind === 'room' ? 120 : 160}
        // Im Raum vorne bleiben: nicht durch die Seitenwände hinausdrehen
        minAzimuthAngle={env.setting?.kind === 'room' ? -1.2 : -Infinity}
        maxAzimuthAngle={env.setting?.kind === 'room' ? 1.2 : Infinity}
        maxPolarAngle={1.45}
        screenSpacePanning={false}
        mouseButtons={{ LEFT: hand ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
        touches={{ ONE: hand ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
      />

      <Environment3D env={env} rect={rect} hiRes={!lowPower} shadowSize={software ? 512 : lowPower ? 1024 : 2048} detail={software ? 'minimal' : lowPower ? 'lite' : 'full'} />
      <Systembrett rect={rect} style={boardStyle} />

      {/* Unsichtbare Ebene auf Brett-Höhe: Klicks, Abwählen, Cursor – auch neben dem Brett */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.002, 0]}
        onPointerDown={(e) => {
          groundDown.current = e.nativeEvent.button !== 2
          if (e.nativeEvent.button === 2) return
          ed.setContextMenu(null)
        }}
        onClick={(e) => {
          if (!groundDown.current || e.delta > DRAG_THRESHOLD) return
          groundDown.current = false
          const ne = e.nativeEvent
          if (!(ne.shiftKey || ne.metaKey || ne.ctrlKey)) setSelection([])
          ed.setConnectFrom(null)
        }}
        onPointerMove={(e) => {
          if (e.nativeEvent.pointerType !== 'touch') ed.onPointerBoard?.(toBoardPoint(e.point.x, e.point.z))
        }}
        onPointerLeave={() => ed.onPointerBoard?.(null)}
        onContextMenu={(e) => {
          e.nativeEvent.preventDefault()
          const bp = toBoardPoint(e.point.x, e.point.z)
          ed.setContextMenu({ x: e.nativeEvent.clientX, y: e.nativeEvent.clientY, id: null, boardX: bp.x, boardY: bp.y })
        }}
      >
        <planeGeometry args={[1200, 1200]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>

      {connections.map((c) => (
        <Connection3D
          key={c.id}
          c={c}
          from={state.entities[c.from]?.data}
          to={state.entities[c.to]?.data}
          selected={selection.has(c.id)}
          onSelect={(e) => onEntityDown(c, e)}
        />
      ))}

      {figures.map((f) => (
        <FigureNode
          key={f.id}
          f={f}
          selected={selection.has(f.id)}
          connectSource={ed.connectFrom === f.id}
          showSpeech={settings.speech}
          htmlReady={htmlReady}
          onDown={onEntityDown}
          onContext={onEntityContext}
        />
      ))}

      {notes.map((n) => (
        <NoteNode
          key={n.id}
          n={n}
          htmlReady={htmlReady}
          selected={selection.has(n.id)}
          editing={ed.editingNote === n.id}
          onDown={onEntityDown}
          onContext={onEntityContext}
        />
      ))}

      {rotatable && <RotateRing f={rotatable} onDown={onRotateDown} />}
    </>
  )
}

const FigureNode = memo(function FigureNode({
  f,
  selected,
  connectSource,
  showSpeech,
  htmlReady,
  onDown,
  onContext,
}: {
  f: Figure
  selected: boolean
  connectSource: boolean
  showSpeech: boolean
  htmlReady: boolean
  onDown: (hit: BoardEntity, e: ThreeEvent<PointerEvent>) => void
  onContext: (hit: BoardEntity, e: ThreeEvent<MouseEvent>) => void
}) {
  const tpl = getTemplate(f.type)
  const r = tpl.size * f.scale * WORLD_SCALE
  const h = figureHeight(tpl, r)
  const [hover, setHover] = useState(false)
  const { gl } = useThree()
  useEffect(() => {
    gl.domElement.style.cursor = hover ? (f.locked ? 'not-allowed' : 'grab') : ''
  }, [hover, f.locked, gl])

  return (
    <group position={[f.x * WORLD_SCALE, 0, f.y * WORLD_SCALE]}>
      <group
        rotation={[0, yawFromRotation(f.rotation), 0]}
        onPointerDown={(e) => onDown(f, e)}
        onContextMenu={(e) => onContext(f, e)}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHover(true)
        }}
        onPointerOut={() => setHover(false)}
      >
        <FigureModel tpl={tpl} r={r} color={f.color} opacity={f.visible ? 1 : 0.35} />
        {/* grosszügige, unsichtbare Trefferfläche für Touch */}
        <mesh position={[0, h / 2, 0]}>
          <cylinderGeometry args={[Math.max(r * 1.15, 1.1), Math.max(r * 1.15, 1.1), h, 12]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
      {(selected || connectSource) && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <ringGeometry args={[r * 1.25, r * 1.25 + 0.14, 48]} />
          <meshBasicMaterial color={connectSource ? '#c0704f' : '#5b7a5a'} />
        </mesh>
      )}
      {htmlReady && (f.label || f.locked || (showSpeech && f.speech)) && (
        // Sprechblase und Beschriftung in einem Element: überlappen nie, egal wie weit gezoomt
        <Html position={[0, h + 0.35, 0]} zIndexRange={[7, 0]} style={{ pointerEvents: 'none' }}>
          <div className="flex -translate-x-1/2 -translate-y-full flex-col items-center gap-1.5">
            {showSpeech && f.speech && <SpeechBubble f={f} />}
            {(f.label || f.locked) && (
              <div className="flex items-center gap-1 rounded-full bg-surface/85 px-2 py-0.5 text-[13px] font-semibold whitespace-nowrap text-ink shadow-soft">
                {f.locked && <Icon name="lock" size={12} />}
                {f.label}
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  )
})

const NoteNode = memo(function NoteNode({
  n,
  htmlReady,
  selected,
  editing,
  onDown,
  onContext,
}: {
  n: Note
  htmlReady: boolean
  selected: boolean
  editing: boolean
  onDown: (hit: BoardEntity, e: ThreeEvent<PointerEvent>) => void
  onContext: (hit: BoardEntity, e: ThreeEvent<MouseEvent>) => void
}) {
  const s = noteSize(n)
  const w = s.w * WORLD_SCALE
  const d = s.h * WORLD_SCALE
  return (
    <group position={[n.x * WORLD_SCALE, 0, n.y * WORLD_SCALE]}>
      <mesh
        rotation={[0, yawFromRotation(n.rotation), 0]}
        position={[0, 0.06, 0]}
        castShadow
        receiveShadow
        onPointerDown={(e) => onDown(n, e)}
        onContextMenu={(e) => onContext(n, e)}
      >
        <boxGeometry args={[w, 0.12, d]} />
        <meshStandardMaterial color={n.color} roughness={0.85} transparent={!n.visible} opacity={n.visible ? 1 : 0.35} />
      </mesh>
      {selected && (
        <group rotation={[0, yawFromRotation(n.rotation), 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
            <planeGeometry args={[w + 0.4, d + 0.4]} />
            <meshBasicMaterial color="#5b7a5a" transparent opacity={0.35} />
          </mesh>
        </group>
      )}
      {htmlReady && (
        <Html position={[0, 0.5, 0]} center zIndexRange={[6, 0]} style={{ pointerEvents: editing ? 'auto' : 'none' }}>
          {editing ? (
            <NoteEditor3D n={n} />
          ) : (
            <div className="max-w-56 rounded-lg bg-surface/80 px-2 py-1 text-xs break-words whitespace-pre-wrap text-ink shadow-soft">
              {n.text || <span className="text-ink-3 italic">Notiz</span>}
            </div>
          )}
        </Html>
      )}
    </group>
  )
})

function NoteEditor3D({ n }: { n: Note }) {
  const ed = useEditor()
  const [text, setText] = useState(n.text)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const commit = () => {
    if (text !== n.text) ed.store.execute([{ op: 'patch', id: n.id, fields: { text } }])
    ed.setEditingNote(null)
  }
  return (
    <textarea
      ref={ref}
      aria-label="Notiztext"
      value={text}
      maxLength={1000}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) commit()
      }}
      style={{ background: n.color }}
      className="h-28 w-56 resize-none rounded-[10px] border-2 border-moss px-3 py-2 text-sm text-ink outline-none"
    />
  )
}

/** Drehring um die gewählte Figur, mit Griff in Blickrichtung. */
function RotateRing({ f, onDown }: { f: Figure; onDown: (f: Figure, e: ThreeEvent<PointerEvent>) => void }) {
  const tpl = getTemplate(f.type)
  const r = tpl.size * f.scale * WORLD_SCALE
  const R = r * 1.25 + 0.7
  return (
    <group position={[f.x * WORLD_SCALE, 0.04, f.y * WORLD_SCALE]} rotation={[0, yawFromRotation(f.rotation), 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} onPointerDown={(e) => onDown(f, e)}>
        <ringGeometry args={[R - 0.06, R + 0.06, 64]} />
        <meshBasicMaterial color="#5b7a5a" transparent opacity={0.5} />
      </mesh>
      {/* breite unsichtbare Trefferzone für Finger */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} onPointerDown={(e) => onDown(f, e)}>
        <ringGeometry args={[R - 0.45, R + 0.45, 48]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.25, -R]} onPointerDown={(e) => onDown(f, e)} castShadow>
        <sphereGeometry args={[0.32, 20, 14]} />
        <meshStandardMaterial color="#fffdf9" emissive="#5b7a5a" emissiveIntensity={0.25} />
      </mesh>
    </group>
  )
}

function round(v: number, f = 10): number {
  return Math.round(v * f) / f
}

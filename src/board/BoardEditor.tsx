import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { BoardStore } from '../state/boardStore'
import { Canvas, isTyping } from './Canvas'
import { ContextMenu } from './ContextMenu'
import { EditorContext, useEditor as useEditorCtx, useStoreVersion, type BoardPermissions, type ContextMenuState, type EditorApi, type Tool } from './editor'
import { Library } from './Library'
import { PropertiesPanel } from './PropertiesPanel'
import { createActions } from './actions'
import { toBoard, type Point, type Viewport } from './geometry'
import { Icon } from '../components/Icon'
import { CONNECTION_PRESETS } from '../domain/connections'
import type { ConnectionType } from '../domain/types'
import { useMediaQuery } from '../lib/useMediaQuery'
import type { Board3DHandle } from '../board3d/Board3D'

// Die 3D-Ansicht (Three.js) wird erst geladen, wenn sie gebraucht wird
const Board3D = lazy(() => import('../board3d/Board3D'))

export type BoardView = '2d' | '3d'
const VIEW_KEY = 'constellaboard.view'

function loadView(): BoardView {
  try {
    return localStorage.getItem(VIEW_KEY) === '3d' && webglAvailable() ? '3d' : '2d'
  } catch {
    return '2d'
  }
}

let webglCache: boolean | null = null
function webglAvailable(): boolean {
  if (webglCache !== null) return webglCache
  try {
    const c = document.createElement('canvas')
    webglCache = !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    webglCache = false
  }
  return webglCache
}

export interface BoardEditorProps {
  store: BoardStore
  perms: BoardPermissions
  /** Inhalt links in der Kopfzeile */
  headerLeft?: ReactNode
  /** Inhalt rechts in der Kopfzeile (Teilnehmende, Teilen, Beenden) */
  headerRight?: ReactNode
  /** Zusätzliche Darstellung über dem Brett (z. B. fremde Cursor), Bildschirmkoordinaten */
  overlay?: (v: Viewport) => ReactNode
  /** Hinweisleiste unter der Kopfzeile */
  banner?: ReactNode
  onPointerBoard?: (p: Point | null) => void
  onSelectionChange?: (ids: string[]) => void
}

/**
 * Vollständiger Brett-Editor: Arbeitsfläche, Figurenbibliothek,
 * Werkzeuge, Eigenschaften, Kontextmenü und Tastaturkürzel.
 * Unabhängig davon, ob lokal oder in einer Live-Sitzung gearbeitet wird.
 */
export function BoardEditor({ store, perms, headerLeft, headerRight, overlay, banner, onPointerBoard, onSelectionChange }: BoardEditorProps) {
  const isWide = useMediaQuery('(min-width: 900px)')
  const [selection, setSelectionState] = useState<ReadonlySet<string>>(new Set())
  const [tool, setTool] = useState<Tool>('select')
  const [connectType, setConnectType] = useState<ConnectionType>('normal')
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, k: 1 })
  const [editingNote, setEditingNote] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const [labelFocusToken, setLabelFocusToken] = useState(0)
  const [libraryOpen, setLibraryOpen] = useState(isWide)
  const [propsOpen, setPropsOpen] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [view, setViewState] = useState<BoardView>(loadView)
  const board3d = useRef<Board3DHandle | null>(null)
  const setView = useCallback((v: BoardView) => {
    setViewState(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* privater Modus: Auswahl gilt nur für diesen Besuch */
    }
  }, [])
  const toastTimer = useRef<number | null>(null)
  const centered = useRef(false)
  useStoreVersion(store)

  // Auf Smartphones startet die Bibliothek eingeklappt
  useEffect(() => setLibraryOpen(isWide), [isWide])

  // Ursprung beim ersten Messen in die Mitte legen
  useEffect(() => {
    if (!centered.current && canvasSize.width > 0) {
      centered.current = true
      setViewport({ x: canvasSize.width / 2, y: canvasSize.height / 2, k: isWide ? 1 : 0.8 })
    }
  }, [canvasSize, isWide])

  const wideRef = useRef(isWide)
  wideRef.current = isWide
  const selectionRef = useRef(selection)
  selectionRef.current = selection
  const setSelection = useCallback((ids: Iterable<string>) => {
    const next = new Set(ids)
    if (sameSet(selectionRef.current, next)) return
    selectionRef.current = next
    setSelectionState(next)
    // Auf dem Desktop öffnen sich die Eigenschaften automatisch, auf kleinen Bildschirmen erst auf Wunsch
    setPropsOpen(wideRef.current && next.size > 0)
  }, [])

  // Auswahl bereinigen, wenn Elemente (z. B. durch andere) gelöscht werden
  const state = store.getState()
  useEffect(() => {
    const valid = [...selection].filter((id) => state.entities[id])
    if (valid.length !== selection.size) setSelectionState(new Set(valid))
  }, [state, selection])

  useEffect(() => onSelectionChange?.([...selection]), [selection, onSelectionChange])

  const notify = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }, [])

  const api: EditorApi = {
    store,
    perms,
    selection,
    setSelection,
    tool,
    setTool: (t) => {
      setTool(t)
      setConnectFrom(null)
    },
    connectType,
    setConnectType,
    connectFrom,
    setConnectFrom,
    viewport,
    setViewport,
    editingNote,
    setEditingNote,
    contextMenu,
    setContextMenu,
    canvasSize,
    setCanvasSize,
    onPointerBoard,
    requestLabelFocus: () => {
      setPropsOpen(true)
      setLabelFocusToken((t) => t + 1)
    },
    labelFocusToken,
    notify,
    viewCenter: view === '3d' ? () => board3d.current?.center() ?? { x: 0, y: 0 } : undefined,
  }
  const actions = useMemo(() => createActions(api), [api])

  // Tastaturkürzel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return
      const mod = e.metaKey || e.ctrlKey
      const k = e.key.toLowerCase()
      if (mod && k === 'z' && !e.shiftKey) {
        e.preventDefault()
        actions.undo()
      } else if ((mod && k === 'z' && e.shiftKey) || (mod && k === 'y')) {
        e.preventDefault()
        actions.redo()
      } else if (mod && k === 'd') {
        e.preventDefault()
        actions.duplicate()
      } else if (mod && k === 'a') {
        e.preventDefault()
        actions.selectAll()
      } else if (mod && k === 'g') {
        e.preventDefault()
        if (e.shiftKey) actions.ungroup()
        else actions.group()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selection.size) {
          e.preventDefault()
          actions.remove()
        }
      } else if (e.key === 'Escape') {
        setSelection([])
        setConnectFrom(null)
        setTool('select')
        setContextMenu(null)
      } else if (e.key.startsWith('Arrow') && selection.size) {
        e.preventDefault()
        const d = e.shiftKey ? 20 : 4
        actions.nudge(e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0)
      } else if (!mod && k === 'v') setTool('select')
      else if (!mod && k === 'h') setTool('hand')
      else if (!mod && k === 'c' && perms.connect) setTool('connect')
      else if (!mod && k === 'r' && selection.size) actions.rotateBy(e.shiftKey ? -45 : 45)
      else if (!mod && (k === '+' || k === '=')) actions.zoomBy(1.2)
      else if (!mod && k === '-') actions.zoomBy(1 / 1.2)
      else if (!mod && k === '0') actions.fit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [actions, selection, perms.connect, setSelection])

  const canvasWrap = useRef<HTMLDivElement>(null)
  const dropFromLibrary = (type: string, clientX: number, clientY: number): boolean => {
    const el = canvasWrap.current
    if (!el) return false
    const r = el.getBoundingClientRect()
    if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return false
    // nicht auf Panels ablegen
    const under = document.elementFromPoint(clientX, clientY)
    if (under && !under.closest('[data-testid="board"], [data-testid="board-3d"]')) return false
    if (view === '3d') {
      const p = board3d.current?.pick(clientX, clientY)
      if (!p) return false
      actions.addFigure(type, p)
      return true
    }
    actions.addFigure(type, toBoard(viewport, { x: clientX - r.left, y: clientY - r.top }))
    return true
  }

  const showProps = selection.size > 0 && propsOpen && !editingNote
  const showQuickBar = !isWide && selection.size > 0 && !propsOpen && !editingNote

  return (
    <EditorContext.Provider value={api}>
      <div className="flex h-dvh flex-col overflow-hidden bg-paper">
        <header className="z-20 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface/90 px-2 backdrop-blur sm:px-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">{headerLeft}</div>
          <div className="flex items-center gap-0.5">
            <button className="icon-btn" onClick={actions.undo} disabled={!store.canUndo} aria-label="Rückgängig" title="Rückgängig (Ctrl+Z)" data-testid="undo">
              <Icon name="undo" />
            </button>
            <button className="icon-btn" onClick={actions.redo} disabled={!store.canRedo} aria-label="Wiederherstellen" title="Wiederherstellen (Ctrl+Shift+Z)" data-testid="redo">
              <Icon name="redo" />
            </button>
          </div>
          <div className="flex items-center gap-1.5">{headerRight}</div>
        </header>
        {banner}
        <div className="relative flex-1" ref={canvasWrap}>
          {view === '2d' ? (
            <Canvas overlay={overlay} onDropTemplate={(type, p) => actions.addFigure(type, p)} />
          ) : (
            <View3DBoundary onError={() => { setView('2d'); notify('Die 3D-Ansicht konnte nicht geladen werden.') }}>
              <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center text-sm text-ink-3">3D-Ansicht wird geladen …</div>}>
                <Board3D handleRef={board3d} />
              </Suspense>
            </View3DBoundary>
          )}

          {/* Werkzeuge */}
          <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3">
            <div className="panel pointer-events-auto flex items-center gap-0.5 p-1" role="toolbar" aria-label="Werkzeuge">
              <ViewToggle view={view} onChange={(v) => {
                if (v === '3d' && !webglAvailable()) {
                  notify('Dieses Gerät unterstützt keine 3D-Darstellung (WebGL).')
                  return
                }
                setContextMenu(null)
                setView(v)
              }} />
              <button className="icon-btn" aria-pressed={tool === 'select'} onClick={() => api.setTool('select')} aria-label="Auswählen" title="Auswählen (V)">
                <Icon name="pointer" />
              </button>
              <button className="icon-btn" aria-pressed={tool === 'hand'} onClick={() => api.setTool('hand')} aria-label="Fläche verschieben" title="Verschieben (H)">
                <Icon name="hand" />
              </button>
              {perms.connect && (
                <button className="icon-btn" aria-pressed={tool === 'connect'} onClick={() => api.setTool(tool === 'connect' ? 'select' : 'connect')} aria-label="Verbinden" title="Verbindung zeichnen (C)" data-testid="tool-connect">
                  <Icon name="link" />
                </button>
              )}
              {perms.add && (
                <button className="icon-btn" onClick={() => actions.addNote()} aria-label="Textnotiz" title="Textnotiz">
                  <Icon name="note" />
                </button>
              )}
              {tool === 'connect' && (
                <select
                  className="ml-1 h-11 rounded-xl border border-line bg-white px-2 text-sm"
                  value={connectType}
                  onChange={(e) => setConnectType(e.target.value as ConnectionType)}
                  aria-label="Beziehungsart"
                  data-testid="connect-type"
                >
                  {CONNECTION_PRESETS.map((p) => (
                    <option key={p.type} value={p.type}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          {tool === 'connect' && (
            <div className="pointer-events-none absolute inset-x-0 top-[4.5rem] z-10 flex justify-center px-3">
              <div className="rounded-full bg-ink/80 px-4 py-1.5 text-center text-xs text-white">
                {connectFrom ? 'Jetzt die zweite Figur antippen' : 'Erste Figur antippen, dann die zweite'}
              </div>
            </div>
          )}

          {/* Bibliothek */}
          {perms.add &&
            (isWide ? (
              libraryOpen ? (
                <aside className="panel absolute top-3 bottom-3 left-3 z-10 flex w-60 flex-col overflow-hidden" aria-label="Figurenbibliothek">
                  <button className="icon-btn absolute top-2 right-2 z-10" onClick={() => setLibraryOpen(false)} aria-label="Bibliothek einklappen">
                    <Icon name="close" size={18} />
                  </button>
                  <Library onAdd={(t) => actions.addFigure(t)} onDrop={dropFromLibrary} onAddNote={() => actions.addNote()} disabled={!perms.add} />
                </aside>
              ) : (
                <button className="panel absolute top-3 left-3 z-10 flex h-12 items-center gap-2 px-4 text-sm font-medium" onClick={() => setLibraryOpen(true)}>
                  <Icon name="library" size={18} /> Figuren
                </button>
              )
            ) : (
              <>
                {showQuickBar && <QuickBar actions={actions} onEdit={() => setPropsOpen(true)} />}
                {libraryOpen && !showProps && !showQuickBar && (
                  <div className="panel absolute inset-x-2 bottom-2 z-20 pt-2" aria-label="Figurenbibliothek">
                    <div className="flex items-center justify-between px-3 pb-2">
                      <span className="text-sm font-medium">Figuren – antippen oder nach oben ziehen</span>
                      <button className="icon-btn -mr-1 h-9 w-9" onClick={() => setLibraryOpen(false)} aria-label="Bibliothek schliessen">
                        <Icon name="close" size={18} />
                      </button>
                    </div>
                    <Library layout="sheet" onAdd={(t) => actions.addFigure(t)} onDrop={dropFromLibrary} onAddNote={() => actions.addNote()} disabled={!perms.add} />
                  </div>
                )}
                {!libraryOpen && !showProps && !showQuickBar && (
                  <button className="btn-primary absolute bottom-4 left-4 z-10 shadow-lift" onClick={() => setLibraryOpen(true)} data-testid="open-library">
                    <Icon name="plus" size={18} /> Figur
                  </button>
                )}
              </>
            ))}

          {/* Eigenschaften */}
          {showProps &&
            (isWide ? (
              <aside className="panel absolute top-3 right-3 bottom-20 z-10 w-72 overflow-hidden" aria-label="Eigenschaften">
                <PropertiesPanel actions={actions} onClose={() => setPropsOpen(false)} />
              </aside>
            ) : (
              <div className="panel absolute inset-x-2 bottom-2 z-20 max-h-[48%] overflow-hidden" aria-label="Eigenschaften">
                <PropertiesPanel actions={actions} onClose={() => setPropsOpen(false)} />
              </div>
            ))}

          {/* Zoom */}
          {view === '2d' && (isWide || !showProps) && (
            <div className={`panel absolute right-3 z-10 flex items-center gap-0.5 p-1 ${isWide ? 'bottom-3' : libraryOpen ? 'top-3 flex-col' : 'bottom-4'}`}>
              <button className="icon-btn" onClick={() => actions.zoomBy(1 / 1.25)} aria-label="Verkleinern" data-testid="zoom-out">
                <Icon name="minus" />
              </button>
              <button className="h-11 min-w-14 rounded-xl px-1 text-xs font-medium text-ink-2 tabular-nums hover:bg-paper-2" onClick={actions.zoomReset} title="Auf 100 % zurücksetzen" data-testid="zoom-level">
                {Math.round(viewport.k * 100)}%
              </button>
              <button className="icon-btn" onClick={() => actions.zoomBy(1.25)} aria-label="Vergrössern" data-testid="zoom-in">
                <Icon name="plus" />
              </button>
              <button className="icon-btn" onClick={actions.fit} aria-label="Alles anzeigen" title="Alles anzeigen (0)">
                <Icon name="fit" />
              </button>
            </div>
          )}

          <ContextMenu actions={actions} onOpenProperties={() => setPropsOpen(true)} />

          {toast && (
            <div role="status" className="pointer-events-none absolute inset-x-0 bottom-24 z-30 flex justify-center">
              <div className="rounded-full bg-ink px-4 py-2 text-sm text-white shadow-lift">{toast}</div>
            </div>
          )}
        </div>
      </div>
    </EditorContext.Provider>
  )
}

/** Umschalter zwischen 2D-Brett und 3D-Ansicht. */
function ViewToggle({ view, onChange }: { view: BoardView; onChange: (v: BoardView) => void }) {
  return (
    <div className="mr-1 flex rounded-xl bg-paper-2 p-0.5" role="group" aria-label="Ansicht">
      {(['2d', '3d'] as const).map((v) => (
        <button
          key={v}
          className={`h-10 min-w-10 rounded-[10px] px-2 text-sm font-semibold ${view === v ? 'bg-surface text-moss-dark shadow-soft' : 'text-ink-3 hover:text-ink-2'}`}
          aria-pressed={view === v}
          onClick={() => onChange(v)}
          title={v === '2d' ? '2D-Brett (Draufsicht)' : '3D-Ansicht'}
          data-testid={`view-${v}`}
        >
          {v.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

/** Fällt bei Fehlern der 3D-Ansicht (z. B. WebGL-Kontext verloren) auf 2D zurück. */
class View3DBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(err: unknown) {
    console.error('3D-Ansicht', err)
    this.props.onError()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

/** Kompakte Aktionsleiste für die Auswahl auf Smartphones. */
function QuickBar({ actions, onEdit }: { actions: ReturnType<typeof createActions>; onEdit: () => void }) {
  const { perms, selection, store } = useEditorCtx()
  const s = store.getState()
  const locked = [...selection].every((id) => s.entities[id]?.data.locked)
  return (
    <div className="panel absolute inset-x-2 bottom-2 z-20 flex items-center justify-around p-1.5" role="toolbar" aria-label="Auswahl" data-testid="quickbar">
      {perms.edit && (
        <button className="icon-btn" onClick={() => actions.rotateBy(45)} aria-label="Drehen">
          <Icon name="rotate" />
        </button>
      )}
      {perms.add && (
        <button className="icon-btn" onClick={() => actions.duplicate()} aria-label="Duplizieren">
          <Icon name="copy" />
        </button>
      )}
      {perms.lock && (
        <button className="icon-btn" onClick={() => actions.toggleLock()} aria-label={locked ? 'Entsperren' : 'Sperren'}>
          <Icon name={locked ? 'unlock' : 'lock'} />
        </button>
      )}
      {perms.delete && (
        <button className="icon-btn text-clay" onClick={() => actions.remove()} aria-label="Löschen">
          <Icon name="trash" />
        </button>
      )}
      <button className="btn-secondary" onClick={onEdit} data-testid="quickbar-edit">
        <Icon name="settings" size={18} /> Bearbeiten
      </button>
    </div>
  )
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false
  for (const x of a) if (!b.has(x)) return false
  return true
}

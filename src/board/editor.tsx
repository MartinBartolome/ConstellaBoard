import { createContext, useContext, useSyncExternalStore } from 'react'
import type { BoardStore } from '../state/boardStore'
import type { BoardState, ConnectionType } from '../domain/types'
import type { Viewport } from './geometry'

/** Berechtigungen der aktuellen Person auf dem Brett. */
export interface BoardPermissions {
  add: boolean
  move: boolean
  edit: boolean
  delete: boolean
  connect: boolean
  lock: boolean
  /** Ausgeblendete Elemente sehen (Coach) */
  seeHidden: boolean
}

export const FULL_PERMISSIONS: BoardPermissions = {
  add: true,
  move: true,
  edit: true,
  delete: true,
  connect: true,
  lock: true,
  seeHidden: true,
}

export const READ_ONLY: BoardPermissions = {
  add: false,
  move: false,
  edit: false,
  delete: false,
  connect: false,
  lock: false,
  seeHidden: false,
}

export type Tool = 'select' | 'hand' | 'connect'

export interface ContextMenuState {
  x: number
  y: number
  id: string | null
  /** Brettkoordinaten, für „Hier einfügen" */
  boardX: number
  boardY: number
}

export interface EditorApi {
  store: BoardStore
  perms: BoardPermissions
  selection: ReadonlySet<string>
  setSelection: (ids: Iterable<string>) => void
  tool: Tool
  setTool: (t: Tool) => void
  connectType: ConnectionType
  setConnectType: (t: ConnectionType) => void
  connectFrom: string | null
  setConnectFrom: (id: string | null) => void
  viewport: Viewport
  setViewport: (v: Viewport | ((v: Viewport) => Viewport)) => void
  editingNote: string | null
  setEditingNote: (id: string | null) => void
  contextMenu: ContextMenuState | null
  setContextMenu: (m: ContextMenuState | null) => void
  /** Grösse der Zeichenfläche in Pixeln */
  canvasSize: { width: number; height: number }
  setCanvasSize: (s: { width: number; height: number }) => void
  /** Wird beim Bewegen des Zeigers über dem Brett aufgerufen (Brettkoordinaten) */
  onPointerBoard?: (p: { x: number; y: number } | null) => void
  /** Fokus auf Beschriftungsfeld setzen */
  requestLabelFocus: () => void
  labelFocusToken: number
  /** Status-Mitteilung (Toast) */
  notify: (msg: string) => void
  /** Brettpunkt in der Bildmitte, falls die aktive Ansicht ihn selbst bestimmt (3D) */
  viewCenter?: () => { x: number; y: number }
}

export const EditorContext = createContext<EditorApi | null>(null)

export function useEditor(): EditorApi {
  const ctx = useContext(EditorContext)
  if (!ctx) throw new Error('useEditor ausserhalb von EditorContext')
  return ctx
}

export function useBoardState(store: BoardStore): BoardState {
  return useSyncExternalStore(store.subscribe, store.getState)
}

/** Löst bei jeder Änderung (auch Historie) neu aus. */
export function useStoreVersion(store: BoardStore): number {
  return useSyncExternalStore(store.subscribe, store.getVersion)
}

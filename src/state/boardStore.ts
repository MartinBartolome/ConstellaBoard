import { applyOps, highestRev, mergeStates } from '../domain/merge'
import { invertIntents, withRev, type Intent } from '../domain/intents'
import { LamportClock } from '../domain/rev'
import { emptyBoard, type BoardOp, type BoardState } from '../domain/types'
import { randomId } from '../lib/id'

export interface HistoryEntry {
  do: Intent[]
  undo: Intent[]
}

export interface ExecuteOptions {
  /** In die Undo-Historie aufnehmen (Standard: ja) */
  history?: boolean
}

type Listener = () => void
type OpsListener = (ops: BoardOp[]) => void

const HISTORY_LIMIT = 200

/**
 * Dokumentenspeicher des Systembretts.
 *
 * - hält den zusammengeführten Brettzustand
 * - erzeugt Revisionen über eine Lamport-Uhr
 * - verwaltet eine lokale Undo-/Redo-Historie (nur eigene Änderungen)
 * - meldet lokale Operationen an die Synchronisierung
 *
 * Kompatibel mit React `useSyncExternalStore`.
 */
export class BoardStore {
  readonly clientId: string
  private clock: LamportClock
  private state: BoardState
  private undoStack: HistoryEntry[] = []
  private redoStack: HistoryEntry[] = []
  private listeners = new Set<Listener>()
  private opsListeners = new Set<OpsListener>()
  private version = 0
  /** Optionaler Filter für erlaubte Absichten (Berechtigungen) */
  canApply: (intent: Intent, state: BoardState) => boolean = () => true

  constructor(initial: BoardState = emptyBoard(), clientId = randomId(8)) {
    this.clientId = clientId
    this.clock = new LamportClock(clientId)
    this.state = initial
    this.clock.observe({ t: highestRev(initial), c: '' })
  }

  // ---- React-Anbindung -------------------------------------------------

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  getState = (): BoardState => this.state

  /** Ändert sich bei jeder Änderung an Zustand oder Historie */
  getVersion = (): number => this.version

  onLocalOps(l: OpsListener): () => void {
    this.opsListeners.add(l)
    return () => this.opsListeners.delete(l)
  }

  private emit(): void {
    this.version++
    for (const l of this.listeners) l()
  }

  // ---- Lokale Änderungen ----------------------------------------------

  /** Führt Absichten aus; gibt die erzeugten Operationen zurück. */
  execute(intents: Intent[], opts: ExecuteOptions = {}): BoardOp[] {
    const allowed = intents.filter((i) => this.canApply(i, this.state))
    if (allowed.length === 0) return []
    const inverse = invertIntents(this.state, allowed)
    const ops = this.applyLocal(allowed)
    if (opts.history !== false && ops.length > 0) this.pushHistory({ do: allowed, undo: inverse })
    else this.emit()
    return ops
  }

  /** Nimmt einen Schritt nachträglich in die Historie auf (z. B. nach Ziehen). */
  pushHistory(entry: HistoryEntry): void {
    if (entry.do.length === 0) return
    this.undoStack.push(entry)
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift()
    this.redoStack = []
    this.emit()
  }

  undo(): boolean {
    const entry = this.undoStack.pop()
    if (!entry) return false
    this.applyLocal(entry.undo.filter((i) => this.canApply(i, this.state)))
    this.redoStack.push(entry)
    this.emit()
    return true
  }

  redo(): boolean {
    const entry = this.redoStack.pop()
    if (!entry) return false
    this.applyLocal(entry.do.filter((i) => this.canApply(i, this.state)))
    this.undoStack.push(entry)
    this.emit()
    return true
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  clearHistory(): void {
    this.undoStack = []
    this.redoStack = []
    this.emit()
  }

  private applyLocal(intents: Intent[]): BoardOp[] {
    if (intents.length === 0) return []
    const ops = intents.map((i) => withRev(i, this.clock.next()))
    this.state = applyOps(this.state, ops)
    for (const l of this.opsListeners) l(ops)
    this.emit()
    return ops
  }

  // ---- Fremde Änderungen ----------------------------------------------

  applyRemote(ops: BoardOp[]): void {
    for (const op of ops) this.clock.observe(op.rev)
    const next = applyOps(this.state, ops)
    if (next !== this.state) {
      this.state = next
      this.emit()
    }
  }

  /** Führt einen vollständigen Zustand (z. B. vom Server) mit dem lokalen zusammen. */
  mergeState(remote: BoardState): void {
    this.clock.observe({ t: highestRev(remote), c: '' })
    const next = mergeStates(this.state, remote)
    if (next !== this.state) {
      this.state = next
      this.emit()
    }
  }

  /** Ersetzt den Zustand vollständig (z. B. Sitzung beendet). */
  reset(state: BoardState = emptyBoard()): void {
    this.state = state
    this.undoStack = []
    this.redoStack = []
    this.emit()
  }
}

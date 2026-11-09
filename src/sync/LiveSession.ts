import type { BoardStore } from '../state/boardStore'
import type { BoardOp, BoardState } from '../domain/types'
import { validateOps } from '../domain/validate'
import { isOpAllowed, type Permissions } from '../domain/permissions'
import { withRev } from '../domain/intents'
import type { JoinResult, PublicParticipant } from './sessionApi'

/** Verbindungsstatus, wie er in der Oberfläche angezeigt wird. */
export type LiveStatus = 'connecting' | 'online' | 'reconnecting' | 'ended' | 'removed'

export interface PresenceInfo {
  participantId: string
  name: string
  color: string
  role: 'coach' | 'participant'
}

export interface Peer extends PresenceInfo {
  cursor: { x: number; y: number } | null
  selection: string[]
  lastSeen: number
}

export type ControlMessage =
  | { type: 'ended' }
  | { type: 'permissions'; participantId: string }
  | { type: 'removed'; participantId: string }
  | { type: 'participants-changed' }

export interface RealtimeHandlers {
  onOps: (ops: unknown) => void
  onCursor: (participantId: string, p: { x: number; y: number } | null) => void
  onSelection: (participantId: string, ids: string[]) => void
  onPresence: (list: PresenceInfo[]) => void
  onControl: (msg: ControlMessage) => void
  /** true = beide Kanäle verbunden */
  onConnection: (connected: boolean) => void
}

export interface RealtimeLink {
  sendOps(ops: BoardOp[]): void
  sendCursor(p: { x: number; y: number } | null): void
  sendSelection(ids: string[]): void
  close(): Promise<void>
}

/** Abstraktion des Servers – ermöglicht Tests ohne Netzwerk. */
export interface SyncBackend {
  getBoard(): Promise<BoardState>
  pushOps(ops: BoardOp[]): Promise<void>
  validate(active: boolean): Promise<JoinResult>
  connect(me: PresenceInfo, canSendOps: boolean, handlers: RealtimeHandlers): Promise<RealtimeLink>
}

/** Fehler mit HTTP-Status (Duck-Typing, damit Backend-Fehler erkannt werden). */
function statusOf(e: unknown): number {
  return typeof e === 'object' && e && 'status' in e ? Number((e as { status: unknown }).status) : 0
}

export interface LiveSessionOptions {
  flushDelayMs?: number
  heartbeatMs?: number
  cursorIntervalMs?: number
  /** Periodischer Abgleich mit dem Server als Sicherheitsnetz */
  resyncMs?: number
}

type Listener = () => void

/**
 * Verbindet einen BoardStore mit einer Live-Sitzung.
 *
 * Datenfluss:
 *  - lokale Operationen → sofort per Realtime an alle (geringe Latenz)
 *                       → gesammelt an update-board-state (dauerhaft, autoritativ)
 *  - fremde Operationen → validiert → store.applyRemote
 *  - nach (Wieder-)Verbindung → Serverzustand laden und zusammenführen,
 *    ungesendete Operationen erneut senden (Outbox) → kein Datenverlust
 */
export class LiveSession {
  status: LiveStatus = 'connecting'
  me: PublicParticipant
  peers = new Map<string, Peer>()
  /** Anzahl noch nicht bestätigter Operationen */
  pending = 0
  lastError: string | null = null

  private link: RealtimeLink | null = null
  private outbox: BoardOp[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private flushing = false
  private retryDelay = 1000
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private resyncTimer: ReturnType<typeof setInterval> | null = null
  private cursorTimer: ReturnType<typeof setTimeout> | null = null
  private pendingCursor: { x: number; y: number } | null | undefined
  private lastCursorSent = 0
  private connected = false
  private disposed = false
  private unsubscribeStore: (() => void) | null = null
  private listeners = new Set<Listener>()
  private version = 0
  private readonly opts: Required<LiveSessionOptions>
  /** Wird aufgerufen, wenn Coach Teilnehmerliste neu laden sollte */
  onParticipantsChanged: (() => void) | null = null

  constructor(
    readonly sessionId: string,
    join: JoinResult,
    readonly store: BoardStore,
    private readonly backend: SyncBackend,
    opts: LiveSessionOptions = {},
  ) {
    this.me = join.participant
    this.opts = { flushDelayMs: 600, heartbeatMs: 4 * 60_000, cursorIntervalMs: 100, resyncMs: 2 * 60_000, ...opts }
    this.applyPermissions(this.me.permissions)
  }

  // ---- React-Anbindung ----------------------------------------------------
  subscribe = (l: Listener) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }
  getVersion = () => this.version
  private emit() {
    this.version++
    for (const l of this.listeners) l()
  }

  get isCoach(): boolean {
    return this.me.role === 'coach'
  }

  // ---- Lebenszyklus -------------------------------------------------------
  async start(): Promise<void> {
    const initial = await this.backend.getBoard()
    this.store.mergeState(initial)
    this.store.clearHistory()
    this.unsubscribeStore = this.store.onLocalOps((ops) => this.onLocalOps(ops))
    await this.openLink()
    this.heartbeat = setInterval(() => void this.checkMembership(), this.opts.heartbeatMs)
    this.resyncTimer = setInterval(() => {
      if (this.status === 'online') void this.resync()
    }, this.opts.resyncMs)
    if (typeof window !== 'undefined') window.addEventListener('online', this.onOnline)
  }

  private async openLink(): Promise<void> {
    this.link = await this.backend.connect(this.presenceInfo(), this.canSendOps(), {
      onOps: (raw) => this.onRemoteOps(raw),
      onCursor: (id, p) => this.updatePeer(id, { cursor: p }),
      onSelection: (id, sel) => this.updatePeer(id, { selection: sel }),
      onPresence: (list) => this.onPresence(list),
      onControl: (msg) => void this.onControl(msg),
      onConnection: (c) => void this.onConnection(c),
    })
  }

  /**
   * Kanäle neu aufbauen. Nötig, wenn sich die Rechte ändern: Die Realtime-
   * Autorisierung wird beim Beitritt zum Kanal geprüft.
   */
  private async reconnectLink(): Promise<void> {
    const old = this.link
    this.link = null
    this.connected = false
    await old?.close()
    if (!this.disposed) await this.openLink()
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    if (this.heartbeat) clearInterval(this.heartbeat)
    if (this.resyncTimer) clearInterval(this.resyncTimer)
    if (this.flushTimer) clearTimeout(this.flushTimer)
    if (this.cursorTimer) clearTimeout(this.cursorTimer)
    this.unsubscribeStore?.()
    if (typeof window !== 'undefined') window.removeEventListener('online', this.onOnline)
    await this.link?.close()
    this.link = null
  }

  /** Vor dem Verlassen: ausstehende Änderungen noch senden. */
  async flushNow(): Promise<void> {
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = null
    await this.flush()
  }

  private onOnline = () => {
    void this.resync()
  }

  // ---- Lokale Änderungen ----------------------------------------------------
  private onLocalOps(ops: BoardOp[]) {
    if (this.status === 'ended' || this.status === 'removed') return
    this.link?.sendOps(ops)
    this.outbox.push(...ops)
    this.pending = this.outbox.length
    this.scheduleFlush(this.opts.flushDelayMs)
    this.emit()
  }

  private scheduleFlush(delay: number) {
    if (this.flushTimer || this.disposed) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      void this.flush()
    }, delay)
  }

  private async flush(): Promise<void> {
    if (this.flushing || this.outbox.length === 0 || this.status === 'ended' || this.status === 'removed') return
    this.flushing = true
    const batch = this.outbox.slice(0, 400)
    try {
      await this.backend.pushOps(compactOps(batch))
      this.outbox.splice(0, batch.length)
      this.retryDelay = 1000
      this.lastError = null
    } catch (e) {
      const s = statusOf(e)
      if (s === 410) await this.markEnded()
      else if (s === 403) this.markRemoved()
      else if (s === 400 || s === 413) {
        // Vom Server abgelehnt (z. B. fehlende Rechte): verwerfen und Serverzustand übernehmen
        this.outbox.splice(0, batch.length)
        this.lastError = 'Eine Änderung wurde vom Server abgelehnt.'
        void this.resync()
      } else {
        // Netzwerk- oder Serverfehler: später erneut versuchen, nichts geht verloren
        this.lastError = 'Änderungen werden gespeichert, sobald die Verbindung wieder steht.'
        this.retryDelay = Math.min(this.retryDelay * 2, 30_000)
        this.scheduleFlush(this.retryDelay)
      }
    } finally {
      this.flushing = false
      this.pending = this.outbox.length
      this.emit()
      if (this.outbox.length > 0 && !this.flushTimer && this.lastError === null) this.scheduleFlush(50)
    }
  }

  // ---- Fremde Änderungen ----------------------------------------------------
  private onRemoteOps(raw: unknown) {
    const state = this.store.getState()
    const ops = validateOps(raw, (id) => state.entities[id]?.data.kind)
    if (!ops) return
    this.store.applyRemote(ops)
  }

  async resync(): Promise<void> {
    if (this.disposed || this.status === 'ended' || this.status === 'removed') return
    try {
      const remote = await this.backend.getBoard()
      this.store.mergeState(remote)
      if (this.outbox.length) await this.flush()
    } catch (e) {
      const s = statusOf(e)
      if (s === 410) await this.markEnded()
      else if (s === 403) this.markRemoved()
    }
  }

  // ---- Verbindung -----------------------------------------------------------
  private async onConnection(connected: boolean) {
    if (this.status === 'ended' || this.status === 'removed') return
    const was = this.connected
    this.connected = connected
    if (connected) {
      this.status = 'online'
      this.emit()
      // Nach Wiederverbindung alles abgleichen, was in der Zwischenzeit passiert ist
      if (!was) await this.resync()
    } else {
      this.status = 'reconnecting'
      this.emit()
    }
  }

  private async checkMembership() {
    if (this.disposed || this.status === 'ended' || this.status === 'removed') return
    try {
      const visible = typeof document === 'undefined' || document.visibilityState === 'visible'
      const res = await this.backend.validate(visible)
      const changed = JSON.stringify(res.participant.permissions) !== JSON.stringify(this.me.permissions)
      const couldSend = this.canSendOps()
      this.me = res.participant
      if (changed) {
        this.applyPermissions(this.me.permissions)
        if (couldSend !== this.canSendOps()) await this.reconnectLink()
        // Sichtbarkeit kann sich geändert haben (ausgeblendete Elemente)
        await this.resync()
      }
      this.emit()
    } catch (e) {
      const s = statusOf(e)
      if (s === 410 || s === 404) await this.markEnded()
      else if (s === 403) this.markRemoved()
    }
  }

  private async onControl(msg: ControlMessage) {
    switch (msg.type) {
      case 'ended':
        await this.markEnded()
        break
      case 'removed':
        if (msg.participantId === this.me.id) this.markRemoved()
        else this.peers.delete(msg.participantId)
        this.emit()
        break
      case 'permissions':
        if (msg.participantId === this.me.id) await this.checkMembership()
        break
      case 'participants-changed':
        this.onParticipantsChanged?.()
        break
    }
  }

  private async markEnded() {
    if (this.status === 'ended') return
    this.status = 'ended'
    this.outbox = []
    this.pending = 0
    // Lokale Kopie ebenfalls verwerfen
    this.store.reset()
    this.emit()
    await this.dispose()
  }

  private markRemoved() {
    if (this.status === 'removed') return
    this.status = 'removed'
    this.outbox = []
    this.store.reset()
    this.emit()
    void this.dispose()
  }

  // ---- Rechte -----------------------------------------------------------------
  private applyPermissions(p: Permissions) {
    const clientId = this.me.clientId
    this.store.canApply = (intent, state) => isOpAllowed(withRev(intent, { t: 0, c: clientId }), p, state, clientId)
  }

  private canSendOps(): boolean {
    const p = this.me.permissions
    return this.isCoach || p.add || p.move || p.edit || p.delete || p.connect
  }

  get permissions(): Permissions {
    return this.me.permissions
  }

  // ---- Anwesenheit und Cursor --------------------------------------------------
  private presenceInfo(): PresenceInfo {
    return { participantId: this.me.id, name: this.me.displayName, color: this.me.color, role: this.me.role }
  }

  private onPresence(list: PresenceInfo[]) {
    const ids = new Set<string>()
    for (const p of list) {
      if (p.participantId === this.me.id) continue
      ids.add(p.participantId)
      const ex = this.peers.get(p.participantId)
      this.peers.set(p.participantId, { ...p, cursor: ex?.cursor ?? null, selection: ex?.selection ?? [], lastSeen: Date.now() })
    }
    for (const id of [...this.peers.keys()]) if (!ids.has(id)) this.peers.delete(id)
    this.emit()
  }

  private updatePeer(id: string, patch: Partial<Peer>) {
    if (id === this.me.id) return
    const ex = this.peers.get(id)
    if (!ex) return
    this.peers.set(id, { ...ex, ...patch, lastSeen: Date.now() })
    this.emit()
  }

  /** Gedrosselt: höchstens alle cursorIntervalMs eine Nachricht. */
  sendCursor(p: { x: number; y: number } | null) {
    this.pendingCursor = p
    const now = Date.now()
    const wait = this.opts.cursorIntervalMs - (now - this.lastCursorSent)
    if (wait <= 0) {
      this.lastCursorSent = now
      this.link?.sendCursor(p)
      this.pendingCursor = undefined
    } else if (!this.cursorTimer) {
      this.cursorTimer = setTimeout(() => {
        this.cursorTimer = null
        if (this.pendingCursor !== undefined) {
          this.lastCursorSent = Date.now()
          this.link?.sendCursor(this.pendingCursor)
          this.pendingCursor = undefined
        }
      }, wait)
    }
  }

  sendSelection(ids: string[]) {
    this.link?.sendSelection(ids.slice(0, 50))
  }
}

/**
 * Fasst aufeinanderfolgende Patches desselben Elements zusammen (z. B. viele
 * Zwischenpositionen beim Ziehen). Die höchste Revision bleibt erhalten.
 * Nur benachbarte Patches werden kombiniert, damit die Semantik gleich bleibt.
 */
export function compactOps(ops: BoardOp[]): BoardOp[] {
  const out: BoardOp[] = []
  for (const op of ops) {
    const prev = out[out.length - 1]
    if (prev && prev.op === 'patch' && op.op === 'patch' && prev.id === op.id) {
      out[out.length - 1] = { op: 'patch', id: op.id, fields: { ...prev.fields, ...op.fields }, rev: op.rev }
    } else out.push(op)
  }
  return out
}

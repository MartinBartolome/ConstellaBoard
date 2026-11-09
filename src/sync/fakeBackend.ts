import { applyOp } from '../domain/merge'
import { isOpAllowed, type Permissions } from '../domain/permissions'
import { validateOps } from '../domain/validate'
import { emptyBoard, type BoardOp, type BoardState } from '../domain/types'
import type { ControlMessage, PresenceInfo, RealtimeHandlers, RealtimeLink, SyncBackend } from './LiveSession'
import type { JoinResult, PublicParticipant } from './sessionApi'

/**
 * In-Memory-Server für Tests: bildet das Verhalten der Edge Functions und
 * der Realtime-Kanäle nach (Validierung, Rechte, Broadcast, Abbruch).
 */
export class FakeServer {
  state: BoardState = emptyBoard()
  ended = false
  online = true
  members = new Map<string, { participant: PublicParticipant; handlers?: RealtimeHandlers; presence?: PresenceInfo; removed?: boolean }>()
  pushCount = 0

  join(participant: PublicParticipant): JoinResult {
    this.members.set(participant.id, { participant })
    return { participant, session: { id: 'sess', status: 'active', expiresAt: '', inactivityMinutes: 90, hasAccessCode: false } }
  }

  backendFor(participantId: string): SyncBackend {
    const err = (status: number) => Object.assign(new Error(String(status)), { status })
    const guard = () => {
      if (!this.online) throw err(0)
      if (this.ended) throw err(410)
      const m = this.members.get(participantId)
      if (!m || m.removed) throw err(403)
      return m
    }
    return {
      getBoard: async () => {
        const m = guard()
        if (m.participant.permissions.seeHidden) return this.state
        return { ...this.state, entities: Object.fromEntries(Object.entries(this.state.entities).filter(([, e]) => e.data.visible)) }
      },
      pushOps: async (ops) => {
        const m = guard()
        this.pushCount++
        const valid = validateOps(ops, (id) => this.state.entities[id]?.data.kind)
        if (!valid) throw err(400)
        if (valid.some((o) => o.rev.c !== m.participant.clientId)) throw err(400)
        for (const op of valid) if (isOpAllowed(op, m.participant.permissions, this.state, m.participant.clientId)) this.state = applyOp(this.state, op)
      },
      validate: async () => {
        const m = guard()
        return { participant: m.participant, session: { id: 'sess', status: 'active', expiresAt: '', inactivityMinutes: 90, hasAccessCode: false } }
      },
      connect: async (me, canSendOps, handlers) => {
        const m = this.members.get(participantId)!
        m.handlers = handlers
        m.presence = me
        this.broadcastPresence()
        queueMicrotask(() => handlers.onConnection(this.online))
        const link: RealtimeLink = {
          sendOps: (ops: BoardOp[]) => {
            if (!canSendOps || !this.online) return
            for (const [id, o] of this.members) if (id !== participantId && !o.removed) o.handlers?.onOps(JSON.parse(JSON.stringify(ops)))
          },
          sendCursor: (p) => {
            for (const [id, o] of this.members) if (id !== participantId) o.handlers?.onCursor(participantId, p)
          },
          sendSelection: (ids) => {
            for (const [id, o] of this.members) if (id !== participantId) o.handlers?.onSelection(participantId, ids)
          },
          close: async () => {
            m.handlers = undefined
            m.presence = undefined
            this.broadcastPresence()
          },
        }
        return link
      },
    }
  }

  broadcastPresence() {
    const list = [...this.members.values()].filter((m) => m.presence).map((m) => m.presence!)
    for (const m of this.members.values()) m.handlers?.onPresence(list)
  }

  control(msg: ControlMessage) {
    for (const m of this.members.values()) m.handlers?.onControl(msg)
  }

  setOnline(on: boolean) {
    this.online = on
    for (const m of this.members.values()) m.handlers?.onConnection(on)
  }

  setPermissions(participantId: string, p: Permissions) {
    const m = this.members.get(participantId)!
    m.participant = { ...m.participant, permissions: p }
    this.control({ type: 'permissions', participantId })
  }

  remove(participantId: string) {
    this.members.get(participantId)!.removed = true
    this.control({ type: 'removed', participantId })
  }

  end() {
    this.ended = true
    this.state = emptyBoard()
    this.control({ type: 'ended' })
  }
}

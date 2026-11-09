import type { RealtimeChannel } from '@supabase/supabase-js'
import type { BoardOp } from '../domain/types'
import { supabase } from './supabaseClient'
import { getBoardState, updateBoardState, validateMembership } from './sessionApi'
import type { ControlMessage, PresenceInfo, RealtimeLink, SyncBackend } from './LiveSession'

/**
 * Supabase-Anbindung: Edge Functions für den dauerhaften Zustand,
 * zwei private Realtime-Kanäle für Live-Änderungen und Anwesenheit.
 * Die Zugriffsrechte auf die Kanäle prüft die Datenbank (RLS auf realtime.messages).
 */
export function supabaseBackend(sessionId: string): SyncBackend {
  return {
    async getBoard() {
      return (await getBoardState(sessionId)).state
    },
    async pushOps(ops) {
      await updateBoardState(sessionId, ops)
    },
    validate(active) {
      return validateMembership(sessionId, active)
    },
    async connect(me, canSendOps, h) {
      const sb = supabase()
      await sb.realtime.setAuth()
      const main = sb.channel(`session:${sessionId}`, {
        config: { private: true, broadcast: { self: false }, presence: { key: me.participantId } },
      })
      const ops = sb.channel(`session:${sessionId}:ops`, { config: { private: true, broadcast: { self: false } } })

      let mainUp = false
      let opsUp = false
      const report = () => h.onConnection(mainUp && opsUp)

      main
        .on('broadcast', { event: 'cursor' }, ({ payload }) => {
          const p = payload as { id?: unknown; x?: unknown; y?: unknown }
          if (typeof p.id !== 'string') return
          h.onCursor(p.id, typeof p.x === 'number' && typeof p.y === 'number' ? { x: p.x, y: p.y } : null)
        })
        .on('broadcast', { event: 'selection' }, ({ payload }) => {
          const p = payload as { id?: unknown; ids?: unknown }
          if (typeof p.id === 'string' && Array.isArray(p.ids)) h.onSelection(p.id, p.ids.filter((x): x is string => typeof x === 'string').slice(0, 50))
        })
        .on('broadcast', { event: 'control' }, ({ payload }) => h.onControl(payload as ControlMessage))
        .on('presence', { event: 'sync' }, () => {
          const state = main.presenceState<PresenceInfo>()
          const list: PresenceInfo[] = []
          for (const metas of Object.values(state)) {
            const m = metas[0]
            if (m && typeof m.participantId === 'string') list.push({ participantId: m.participantId, name: String(m.name ?? ''), color: String(m.color ?? '#8a8580'), role: m.role === 'coach' ? 'coach' : 'participant' })
          }
          h.onPresence(list)
        })
        .subscribe(async (status) => {
          mainUp = status === 'SUBSCRIBED'
          if (mainUp) await main.track(me)
          report()
        })

      ops
        .on('broadcast', { event: 'ops' }, ({ payload }) => h.onOps((payload as { ops?: unknown }).ops))
        .subscribe((status) => {
          opsUp = status === 'SUBSCRIBED'
          report()
        })

      const send = (ch: RealtimeChannel, event: string, payload: unknown) => {
        void ch.send({ type: 'broadcast', event, payload })
      }

      const link: RealtimeLink = {
        sendOps(list: BoardOp[]) {
          if (canSendOps) send(ops, 'ops', { ops: list })
        },
        sendCursor(p) {
          send(main, 'cursor', { id: me.participantId, x: p?.x, y: p?.y })
        },
        sendSelection(ids) {
          send(main, 'selection', { id: me.participantId, ids })
        },
        async close() {
          await main.untrack().catch(() => undefined)
          await sb.removeChannel(main)
          await sb.removeChannel(ops)
        },
      }
      return link
    },
  }
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BoardStore } from '../state/boardStore'
import { LiveSession, compactOps } from './LiveSession'
import { FakeServer } from './fakeBackend'
import { COACH_PERMISSIONS, DEFAULT_PARTICIPANT_PERMISSIONS, VIEW_ONLY_PERMISSIONS } from '../domain/permissions'
import { newConnection, newFigure } from '../domain/commands'
import type { PublicParticipant } from './sessionApi'
import type { Figure } from '../domain/types'

const person = (id: string, role: 'coach' | 'participant', permissions = role === 'coach' ? COACH_PERMISSIONS : DEFAULT_PARTICIPANT_PERMISSIONS): PublicParticipant => ({
  id, clientId: `c${id}`, role, displayName: id, color: '#5b7a5a', permissions,
})

async function connect(server: FakeServer, p: PublicParticipant) {
  const join = server.join(p)
  const store = new BoardStore(undefined, p.clientId)
  const live = new LiveSession('sess', join, store, server.backendFor(p.id), { flushDelayMs: 5, heartbeatMs: 1e9, resyncMs: 1e9 })
  await live.start()
  await flushMicrotasks()
  return { store, live }
}

const flushMicrotasks = () => new Promise((r) => setTimeout(r, 0))
const settle = async () => {
  await vi.advanceTimersByTimeAsync(100)
}
const figs = (s: BoardStore) => Object.values(s.getState().entities).map((e) => e.data).filter((e): e is Figure => e.kind === 'figure')

describe('Live-Sitzung (mehrere Teilnehmende)', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('synchronisiert Figuren in Echtzeit und speichert sie auf dem Server', async () => {
    const server = new FakeServer()
    const coach = await connect(server, person('coach', 'coach'))
    const client = await connect(server, person('klient', 'participant'))
    expect(coach.live.status).toBe('online')

    const f = newFigure(coach.store.getState(), 'mann', 10, 20)
    coach.store.execute([{ op: 'create', entity: f }])
    expect(figs(client.store)).toHaveLength(1)

    client.store.execute([{ op: 'patch', id: f.id, fields: { x: 300 } }])
    expect(figs(coach.store)[0]!.x).toBe(300)
    await settle()
    expect((server.state.entities[f.id]!.data as Figure).x).toBe(300)
  })

  it('verliert bei gleichzeitigen Änderungen nichts', async () => {
    const server = new FakeServer()
    const a = await connect(server, person('a', 'coach'))
    const b = await connect(server, person('b', 'participant'))
    const c = await connect(server, person('c', 'participant'))
    const f = newFigure(a.store.getState(), 'frau', 0, 0)
    a.store.execute([{ op: 'create', entity: f }])
    // gleichzeitig verschiedene Felder ändern
    a.store.execute([{ op: 'patch', id: f.id, fields: { label: 'Mutter' } }])
    b.store.execute([{ op: 'patch', id: f.id, fields: { x: 50, y: 60 } }])
    c.store.execute([{ op: 'patch', id: f.id, fields: { rotation: 90 } }])
    await settle()
    for (const s of [a, b, c]) expect(figs(s.store)[0]).toMatchObject({ label: 'Mutter', x: 50, y: 60, rotation: 90 })
    expect(server.state.entities[f.id]!.data).toMatchObject({ label: 'Mutter', x: 50, y: 60, rotation: 90 })
  })

  it('zeigt Anwesenheit und Cursor anderer an', async () => {
    const server = new FakeServer()
    const a = await connect(server, person('a', 'coach'))
    const b = await connect(server, person('b', 'participant'))
    expect([...a.live.peers.keys()]).toEqual(['b'])
    b.live.sendCursor({ x: 5, y: 6 })
    expect(a.live.peers.get('b')?.cursor).toEqual({ x: 5, y: 6 })
    await b.live.dispose()
    expect(a.live.peers.size).toBe(0)
  })

  it('holt nach einem Verbindungsabbruch alles nach (Wiederverbindung)', async () => {
    const server = new FakeServer()
    const a = await connect(server, person('a', 'coach'))
    const b = await connect(server, person('b', 'participant'))
    server.setOnline(false)
    expect(a.live.status).toBe('reconnecting')
    // Während der Unterbrechung arbeiten beide weiter
    const fa = newFigure(a.store.getState(), 'mann', 0, 0)
    a.store.execute([{ op: 'create', entity: fa }])
    const fb = newFigure(b.store.getState(), 'kind-junge', 0, 0)
    b.store.execute([{ op: 'create', entity: fb }])
    await settle()
    expect(a.live.pending).toBeGreaterThan(0)
    server.setOnline(true)
    await vi.advanceTimersByTimeAsync(40_000)
    expect(a.live.status).toBe('online')
    expect(Object.keys(server.state.entities).sort()).toEqual([fa.id, fb.id].sort())
    // Nach dem Abgleich kennen beide beide Figuren
    await a.live.resync()
    await b.live.resync()
    expect(figs(a.store)).toHaveLength(2)
    expect(figs(b.store)).toHaveLength(2)
  })

  it('setzt Berechtigungen durch und übernimmt Änderungen des Coaches', async () => {
    const server = new FakeServer()
    const coach = await connect(server, person('coach', 'coach'))
    const viewer = await connect(server, person('v', 'participant', VIEW_ONLY_PERMISSIONS))
    viewer.store.execute([{ op: 'create', entity: newFigure(viewer.store.getState(), 'mann', 0, 0) }])
    expect(figs(viewer.store)).toHaveLength(0)
    expect(figs(coach.store)).toHaveLength(0)

    server.setPermissions('v', DEFAULT_PARTICIPANT_PERMISSIONS)
    await settle()
    viewer.store.execute([{ op: 'create', entity: newFigure(viewer.store.getState(), 'mann', 0, 0) }])
    await settle()
    expect(figs(coach.store)).toHaveLength(1)
    expect(Object.keys(server.state.entities)).toHaveLength(1)
  })

  it('Server lehnt unberechtigte Löschungen ab', async () => {
    const server = new FakeServer()
    const coach = await connect(server, person('coach', 'coach'))
    const p = person('p', 'participant')
    await connect(server, p)
    const f = newFigure(coach.store.getState(), 'mann', 0, 0)
    coach.store.execute([{ op: 'create', entity: f }])
    await settle()
    // Manipulierter Client sendet direkt an den Server
    await server.backendFor('p').pushOps([{ op: 'delete', id: f.id, rev: { t: 99, c: p.clientId } }])
    expect(server.state.entities[f.id]).toBeDefined()
    // Fremde Client-ID wird abgelehnt
    await expect(server.backendFor('p').pushOps([{ op: 'patch', id: f.id, fields: { x: 1 }, rev: { t: 99, c: 'ccoach' } }])).rejects.toMatchObject({ status: 400 })
  })

  it('beendet die Sitzung und löscht die lokale Kopie', async () => {
    const server = new FakeServer()
    const coach = await connect(server, person('coach', 'coach'))
    const client = await connect(server, person('k', 'participant'))
    const a = newFigure(coach.store.getState(), 'mann', 0, 0)
    const b = newFigure(coach.store.getState(), 'frau', 50, 0)
    coach.store.execute([{ op: 'create', entity: a }, { op: 'create', entity: b }])
    coach.store.execute([{ op: 'create', entity: newConnection(coach.store.getState(), a.id, b.id) }])
    await settle()
    server.end()
    await settle()
    expect(client.live.status).toBe('ended')
    expect(Object.keys(client.store.getState().entities)).toHaveLength(0)
    expect(Object.keys(server.state.entities)).toHaveLength(0)
    // Weitere Zugriffe werden verhindert
    await expect(server.backendFor('k').getBoard()).rejects.toMatchObject({ status: 410 })
  })

  it('entfernt Teilnehmende', async () => {
    const server = new FakeServer()
    await connect(server, person('coach', 'coach'))
    const k = await connect(server, person('k', 'participant'))
    server.remove('k')
    await settle()
    expect(k.live.status).toBe('removed')
  })

  it('fasst Zwischenstände beim Ziehen zusammen', () => {
    const ops = compactOps([
      { op: 'patch', id: 'a', fields: { x: 1 }, rev: { t: 1, c: 'c' } },
      { op: 'patch', id: 'a', fields: { x: 2, y: 3 }, rev: { t: 2, c: 'c' } },
      { op: 'patch', id: 'b', fields: { x: 1 }, rev: { t: 3, c: 'c' } },
    ])
    expect(ops).toHaveLength(2)
    expect(ops[0]).toMatchObject({ fields: { x: 2, y: 3 }, rev: { t: 2 } })
  })
})

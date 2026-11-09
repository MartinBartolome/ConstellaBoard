import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import {
  DEFAULT_PARTICIPANT_PERMISSIONS,
  PERMISSION_LABELS,
  VIEW_ONLY_PERMISSIONS,
  type Permissions,
} from '../domain/permissions'
import type { LiveSession } from '../sync/LiveSession'
import { listParticipants, removeParticipant, setParticipantPermissions, type PublicParticipant } from '../sync/sessionApi'

const PRESETS: { label: string; perms: Permissions }[] = [
  { label: 'Nur ansehen', perms: VIEW_ONLY_PERMISSIONS },
  { label: 'Nur bewegen', perms: { ...VIEW_ONLY_PERMISSIONS, move: true } },
  { label: 'Standard', perms: DEFAULT_PARTICIPANT_PERMISSIONS },
  {
    label: 'Volle Bearbeitung',
    perms: { add: true, move: true, edit: true, delete: true, connect: true, lock: true, seeHidden: false },
  },
]

/** Teilnehmeranzeige; für den Coach mit Rechteverwaltung. */
export function ParticipantsButton({ live }: { live: LiveSession }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const peers = [...live.peers.values()]
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])
  return (
    <div className="relative" ref={ref}>
      <button className="flex h-11 items-center gap-1 rounded-xl px-2 hover:bg-paper-2" onClick={() => setOpen((o) => !o)} aria-label="Teilnehmende" data-testid="participants-button">
        <div className="flex -space-x-2">
          {[{ participantId: live.me.id, name: live.me.displayName, color: live.me.color }, ...peers].slice(0, 4).map((p) => (
            <span key={p.participantId} className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface text-xs font-semibold text-white" style={{ background: p.color }} title={p.name}>
              {initials(p.name)}
            </span>
          ))}
        </div>
        {peers.length > 3 && <span className="text-xs text-ink-3">+{peers.length - 3}</span>}
      </button>
      {open && <Panel live={live} />}
    </div>
  )
}

function Panel({ live }: { live: LiveSession }) {
  const [list, setList] = useState<PublicParticipant[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const online = new Set(live.peers.keys())

  const load = useCallback(async () => {
    if (!live.isCoach) return
    try {
      setList((await listParticipants(live.sessionId)).participants)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler')
    }
  }, [live])

  useEffect(() => {
    void load()
    live.onParticipantsChanged = () => void load()
    return () => {
      live.onParticipantsChanged = null
    }
  }, [live, load])

  const update = async (p: PublicParticipant, perms: Permissions) => {
    setList((l) => l?.map((x) => (x.id === p.id ? { ...x, permissions: perms } : x)) ?? null)
    try {
      await setParticipantPermissions(live.sessionId, p.id, perms)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler')
      void load()
    }
  }

  return (
    <div className="panel absolute top-12 right-0 z-40 w-[min(92vw,22rem)] p-3 shadow-lift" data-testid="participants-panel">
      <h3 className="px-1 pb-2 text-sm font-semibold">Teilnehmende</h3>
      {!live.isCoach && (
        <ul className="space-y-1">
          <Row name={`${live.me.displayName} (Sie)`} color={live.me.color} online />
          {[...live.peers.values()].map((p) => (
            <Row key={p.participantId} name={p.name + (p.role === 'coach' ? ' · Coach' : '')} color={p.color} online />
          ))}
        </ul>
      )}
      {live.isCoach && (
        <ul className="space-y-2">
          {(list ?? []).map((p) => (
            <li key={p.id} className="rounded-xl border border-line p-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ background: p.color }}>
                  {initials(p.displayName)}
                </span>
                <span className="flex-1 truncate text-sm">
                  {p.displayName}
                  {p.id === live.me.id ? ' (Sie)' : ''}
                </span>
                <span className={`text-xs ${p.id === live.me.id || online.has(p.id) ? 'text-moss-dark' : 'text-ink-3'}`}>
                  {p.id === live.me.id || online.has(p.id) ? 'online' : 'offline'}
                </span>
              </div>
              {p.role !== 'coach' && (
                <>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {PRESETS.map((pr) => {
                      const active = JSON.stringify(pr.perms) === JSON.stringify(p.permissions)
                      return (
                        <button
                          key={pr.label}
                          onClick={() => update(p, pr.perms)}
                          aria-pressed={active}
                          className={`rounded-lg border px-2 py-1.5 text-xs ${active ? 'border-moss bg-moss-light text-moss-dark' : 'border-line hover:border-line-strong'}`}
                        >
                          {pr.label}
                        </button>
                      )
                    })}
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-ink-3">Einzelne Rechte</summary>
                    <div className="mt-1.5 grid gap-1">
                      {(Object.keys(PERMISSION_LABELS) as (keyof Permissions)[]).map((k) => (
                        <label key={k} className="flex min-h-9 items-center gap-2 text-xs text-ink-2">
                          <input type="checkbox" className="h-4 w-4 accent-[#5b7a5a]" checked={p.permissions[k]} onChange={(e) => update(p, { ...p.permissions, [k]: e.target.checked })} />
                          {PERMISSION_LABELS[k]}
                        </label>
                      ))}
                    </div>
                  </details>
                  <button
                    className="mt-2 text-xs text-clay hover:underline"
                    onClick={async () => {
                      if (!confirm(`${p.displayName} aus der Sitzung entfernen?`)) return
                      await removeParticipant(live.sessionId, p.id).catch((e) => setError(String(e?.message ?? e)))
                      void load()
                    }}
                  >
                    Entfernen
                  </button>
                </>
              )}
            </li>
          ))}
          {list && list.length <= 1 && <li className="px-1 py-2 text-sm text-ink-3">Noch niemand beigetreten. Teilen Sie den Einladungslink über «Einladen».</li>}
        </ul>
      )}
      {error && <p className="mt-2 text-xs text-clay">{error}</p>}
      {!live.isCoach && (
        <p className="mt-3 flex items-start gap-1.5 px-1 text-xs text-ink-3">
          <Icon name="shield" size={14} className="mt-0.5" /> Ihre Rechte legt der Coach fest.
        </p>
      )}
    </div>
  )
}

function Row({ name, color, online }: { name: string; color: string; online: boolean }) {
  return (
    <li className="flex items-center gap-2 rounded-xl px-1 py-1.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ background: color }}>
        {initials(name)}
      </span>
      <span className="flex-1 truncate text-sm">{name}</span>
      {online && <span className="h-2 w-2 rounded-full bg-moss" />}
    </li>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase()
}

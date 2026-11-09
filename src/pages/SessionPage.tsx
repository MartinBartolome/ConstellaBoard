import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { BoardEditor } from '../board/BoardEditor'
import { toScreen } from '../board/geometry'
import { Icon } from '../components/Icon'
import { LogoMark } from '../components/Logo'
import { Dialog } from '../components/Dialog'
import { Link, absoluteUrl, navigate } from '../lib/router'
import { BoardStore } from '../state/boardStore'
import { LiveSession } from '../sync/LiveSession'
import { isBackendConfigured } from '../sync/config'
import { deriveParticipantToken } from '../sync/inviteToken'
import { ApiError, closeSession, joinSession, type JoinResult } from '../sync/sessionApi'
import { supabaseBackend } from '../sync/supabaseBackend'
import { signOutLocal } from '../sync/supabaseClient'
import { ParticipantsButton } from '../session/ParticipantsPanel'
import { Loading } from '../App'

type Credentials = { role: 'coach' | 'participant'; token: string; joined?: boolean }

type Phase =
  | { kind: 'loading' }
  | { kind: 'welcome'; creds: Credentials; needsCode: boolean; error?: string }
  | { kind: 'joining' }
  | { kind: 'ready'; live: LiveSession; store: BoardStore; creds: Credentials }
  | { kind: 'ended'; reason: 'closed' | 'removed' | 'gone' }
  | { kind: 'error'; message: string }

const STORAGE_PREFIX = 'constellaboard-token:'

/** Liest Token aus der Adresse (#c=… oder #t=…) und entfernt sie danach aus der Adresszeile. */
function takeCredentials(sessionId: string): Credentials | null {
  const hash = new URLSearchParams(location.hash.slice(1))
  const c = hash.get('c')
  const t = hash.get('t')
  let creds: Credentials | null = null
  if (c) creds = { role: 'coach', token: c }
  else if (t) creds = { role: 'participant', token: t }
  if (creds) {
    try {
      sessionStorage.setItem(STORAGE_PREFIX + sessionId, JSON.stringify(creds))
    } catch {
      /* privater Modus: Token bleibt nur im Speicher */
    }
    // Token nicht in der Adresszeile stehen lassen (Bildschirmfreigabe, Verlauf)
    history.replaceState(null, '', location.pathname)
    return creds
  }
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + sessionId)
    return raw ? (JSON.parse(raw) as Credentials) : null
  } catch {
    return null
  }
}

function forgetCredentials(sessionId: string) {
  try {
    sessionStorage.removeItem(STORAGE_PREFIX + sessionId)
  } catch {
    /* ignorieren */
  }
}

export function SessionPage({ sessionId }: { sessionId: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const credsRef = useRef<Credentials | null>(null)

  const join = useCallback(
    async (creds: Credentials, extra: { accessCode?: string; displayName?: string } = {}) => {
      setPhase({ kind: 'joining' })
      try {
        const res: JoinResult = await joinSession(sessionId, creds.token, extra)
        // Beim Neuladen des Tabs direkt wieder beitreten, ohne Willkommensseite
        try {
          sessionStorage.setItem(STORAGE_PREFIX + sessionId, JSON.stringify({ ...creds, joined: true }))
        } catch {
          /* ignorieren */
        }
        const store = new BoardStore(undefined, res.participant.clientId)
        const live = new LiveSession(sessionId, res, store, supabaseBackend(sessionId))
        await live.start()
        setPhase({ kind: 'ready', live, store, creds })
      } catch (e) {
        if (e instanceof ApiError) {
          if (e.code === 'access_code_required' || e.code === 'access_code_wrong')
            return setPhase({ kind: 'welcome', creds, needsCode: true, error: e.code === 'access_code_wrong' ? e.message : undefined })
          if (e.status === 404 || e.status === 410) {
            forgetCredentials(sessionId)
            return setPhase({ kind: 'ended', reason: 'gone' })
          }
          if (e.status === 403) return setPhase({ kind: 'ended', reason: 'removed' })
          return setPhase({ kind: 'error', message: e.message })
        }
        setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'Unbekannter Fehler.' })
      }
    },
    [sessionId],
  )

  useEffect(() => {
    document.title = 'Sitzung – ConstellaBoard'
    if (!isBackendConfigured()) {
      setPhase({ kind: 'error', message: 'Diese Installation ist noch nicht mit einem Server verbunden.' })
      return
    }
    const creds = takeCredentials(sessionId)
    credsRef.current = creds
    if (!creds) {
      setPhase({ kind: 'error', message: 'Der Link ist unvollständig. Bitte öffnen Sie den vollständigen Einladungslink.' })
      return
    }
    if (creds.role === 'coach' || creds.joined) void join(creds)
    else setPhase({ kind: 'welcome', creds, needsCode: false })
  }, [sessionId, join])

  // Neuer Einladungslink in derselben Seite (nur Hash geändert): neu starten
  useEffect(() => {
    const onHash = () => {
      if (/[#&](c|t)=/.test(location.hash)) location.reload()
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Verbindung beim Verlassen der Seite sauber trennen
  useEffect(() => {
    if (phase.kind !== 'ready') return
    const live = phase.live
    const onHide = () => void live.flushNow()
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      void live.dispose()
    }
  }, [phase])

  switch (phase.kind) {
    case 'loading':
    case 'joining':
      return <Loading text={phase.kind === 'joining' ? 'Verbindung zur Sitzung wird hergestellt …' : 'Wird geladen …'} />
    case 'welcome':
      return <WelcomeScreen needsCode={phase.needsCode} error={phase.error} onJoin={(extra) => join(phase.creds, extra)} />
    case 'error':
      return <InfoScreen title="Sitzung nicht verfügbar" text={phase.message} />
    case 'ended':
      return (
        <InfoScreen
          title={phase.reason === 'removed' ? 'Sie wurden aus der Sitzung entfernt' : 'Diese Sitzung ist beendet'}
          text={
            phase.reason === 'removed'
              ? 'Der Coach hat Ihren Zugang beendet. Auf diesem Gerät sind keine Brettdaten mehr gespeichert.'
              : 'Brett, Teilnehmende und Zugänge wurden auf dem Server gelöscht. Auf diesem Gerät sind keine Brettdaten mehr gespeichert.'
          }
        />
      )
    case 'ready':
      return (
        <LiveBoard
          sessionId={sessionId}
          live={phase.live}
          store={phase.store}
          creds={phase.creds}
          onEnded={(reason) => {
            forgetCredentials(sessionId)
            void signOutLocal()
            setPhase({ kind: 'ended', reason })
          }}
        />
      )
  }
}

function LiveBoard({
  sessionId,
  live,
  store,
  creds,
  onEnded,
}: {
  sessionId: string
  live: LiveSession
  store: BoardStore
  creds: Credentials
  onEnded: (reason: 'closed' | 'removed') => void
}) {
  useSyncExternalStore(live.subscribe, live.getVersion)
  const [shareOpen, setShareOpen] = useState(false)
  const [endOpen, setEndOpen] = useState(false)

  useEffect(() => {
    if (live.status === 'ended') onEnded('closed')
    if (live.status === 'removed') onEnded('removed')
  })

  const perms = live.permissions
  const editorPerms = useMemo(() => ({ ...perms, seeHidden: perms.seeHidden || live.isCoach }), [perms, live.isCoach])
  const onPointerBoard = useCallback((p: { x: number; y: number } | null) => live.sendCursor(p), [live])
  const onSelectionChange = useCallback((ids: string[]) => live.sendSelection(ids), [live])
  const readOnly = !perms.add && !perms.move && !perms.edit && !perms.connect

  const peers = [...live.peers.values()]

  return (
    <>
      <BoardEditor
        store={store}
        perms={editorPerms}
        onPointerBoard={onPointerBoard}
        onSelectionChange={onSelectionChange}
        headerLeft={
          <>
            <Link to="/" className="shrink-0 rounded-xl p-1 hover:bg-paper-2">
              <LogoMark size={32} />
            </Link>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{live.isCoach ? 'Ihre Sitzung' : 'Gemeinsame Sitzung'}</div>
              <StatusLine live={live} />
            </div>
          </>
        }
        headerRight={
          <>
            <ParticipantsButton live={live} />
            {live.isCoach ? (
              <>
                <button className="btn-secondary h-11 px-3" onClick={() => setShareOpen(true)} data-testid="share">
                  <Icon name="share" size={18} /> <span className="hidden sm:inline">Einladen</span>
                </button>
                <button className="btn-danger h-11 px-3" onClick={() => setEndOpen(true)} data-testid="end-session">
                  <Icon name="stop" size={18} /> <span className="hidden sm:inline">Beenden</span>
                </button>
              </>
            ) : (
              <button
                className="btn-ghost h-11 px-3"
                onClick={async () => {
                  await live.flushNow()
                  await live.dispose()
                  await signOutLocal()
                  navigate('/')
                }}
              >
                Verlassen
              </button>
            )}
          </>
        }
        banner={
          readOnly ? (
            <div className="border-b border-line bg-moss-light px-4 py-1.5 text-center text-xs text-moss-dark" role="status">
              Nur Ansicht – der Coach kann Ihnen Bearbeitungsrechte geben.
            </div>
          ) : live.status === 'reconnecting' ? (
            <div className="border-b border-line bg-clay-light px-4 py-1.5 text-center text-xs text-clay" role="status">
              Verbindung unterbrochen – Ihre Änderungen werden gespeichert, sobald sie wieder steht.
            </div>
          ) : null
        }
        overlay={(v) => (
          <g style={{ pointerEvents: 'none' }}>
            {peers.map((p) => {
              if (!p.cursor) return null
              const s = toScreen(v, p.cursor)
              return (
                <g key={p.participantId} transform={`translate(${s.x} ${s.y})`} data-testid="remote-cursor">
                  <path d="M0 0 L0 17 L4.5 13 L8 20 L11 18.5 L7.5 12 L13 12 Z" fill={p.color} stroke="#fff" strokeWidth={1.5} />
                  <g transform="translate(14 18)">
                    <rect rx={8} height={20} width={p.name.length * 7 + 14} fill={p.color} />
                    <text x={7} y={14} fontSize={12} fill="#fff" fontWeight={500}>
                      {p.name}
                    </text>
                  </g>
                </g>
              )
            })}
          </g>
        )}
      />
      {shareOpen && <ShareDialog sessionId={sessionId} coachToken={creds.token} onClose={() => setShareOpen(false)} />}
      {endOpen && (
        <EndDialog
          onCancel={() => setEndOpen(false)}
          onConfirm={async () => {
            await live.flushNow().catch(() => undefined)
            await closeSession(sessionId)
            await live.dispose()
            onEnded('closed')
          }}
        />
      )}
    </>
  )
}

function StatusLine({ live }: { live: LiveSession }) {
  const n = live.peers.size
  const label =
    live.status === 'online'
      ? n === 0
        ? 'Verbunden · noch niemand sonst da'
        : `Verbunden · ${n} weitere Person${n === 1 ? '' : 'en'}`
      : live.status === 'reconnecting'
        ? 'Verbindung wird wiederhergestellt …'
        : 'Verbinden …'
  return (
    <div className="flex items-center gap-1.5 truncate text-xs text-ink-3" data-testid="connection-status" data-status={live.status}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${live.status === 'online' ? 'bg-moss' : 'animate-pulse bg-clay'}`} />
      <span className="truncate">
        {label}
        {live.pending > 0 && live.status !== 'online' ? ` · ${live.pending} ungespeichert` : ''}
      </span>
    </div>
  )
}

function ShareDialog({ sessionId, coachToken, onClose }: { sessionId: string; coachToken: string; onClose: () => void }) {
  const [invite, setInvite] = useState<string>('')
  const [copied, setCopied] = useState<string | null>(null)
  useEffect(() => {
    void deriveParticipantToken(coachToken, sessionId).then((t) => setInvite(absoluteUrl(`/s/${sessionId}#t=${t}`)))
  }, [coachToken, sessionId])
  const coachLink = absoluteUrl(`/s/${sessionId}#c=${coachToken}`)
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      setCopied('Bitte manuell kopieren')
    }
  }
  return (
    <Dialog title="Klientin oder Klient einladen" onClose={onClose}>
      <p className="text-sm text-ink-2">
        Senden Sie diesen geheimen Link über einen vertraulichen Kanal. Wer den Link hat, kann der Sitzung beitreten – ohne Konto und ohne Namen.
      </p>
      <label className="field-label mt-4" htmlFor="invite-link">
        Einladungslink
      </label>
      <div className="flex gap-2">
        <input id="invite-link" readOnly className="input font-mono text-xs" value={invite} onFocus={(e) => e.target.select()} data-testid="invite-link" />
        <button className="btn-primary shrink-0" onClick={() => copy(invite, 'Einladungslink kopiert')} disabled={!invite}>
          Kopieren
        </button>
      </div>
      <details className="mt-5 rounded-xl border border-line p-3 text-sm">
        <summary className="cursor-pointer font-medium text-ink-2">Coach-Link (auf anderem Gerät weiterarbeiten)</summary>
        <p className="mt-2 text-xs text-clay">Nicht weitergeben – dieser Link gibt volle Kontrolle über die Sitzung.</p>
        <div className="mt-2 flex gap-2">
          <input readOnly className="input font-mono text-xs" value={coachLink} onFocus={(e) => e.target.select()} />
          <button className="btn-secondary shrink-0" onClick={() => copy(coachLink, 'Coach-Link kopiert')}>
            Kopieren
          </button>
        </div>
      </details>
      {copied && (
        <p className="mt-3 text-sm text-moss-dark" role="status">
          <Icon name="check" size={16} className="mr-1 inline" />
          {copied}
        </p>
      )}
    </Dialog>
  )
}

function EndDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Dialog title="Sitzung beenden?" onClose={onCancel}>
      <p className="text-sm text-ink-2">Beim Beenden passiert Folgendes – unwiderruflich:</p>
      <ul className="mt-3 space-y-1.5 text-sm text-ink-2">
        <li>• Alle Teilnehmenden werden getrennt und können nicht mehr zugreifen.</li>
        <li>• Brett, Teilnehmerdaten und Zugangslinks werden auf dem Server gelöscht.</li>
      </ul>
      <p className="mt-3 text-sm text-ink-3">Tipp: Wenn Sie das Bild behalten möchten, erstellen Sie vorher selbst einen Screenshot.</p>
      {error && <p className="mt-3 rounded-xl bg-clay-light px-3 py-2 text-sm text-clay">{error}</p>}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button className="btn-secondary" onClick={onCancel} disabled={busy}>
          Abbrechen
        </button>
        <button
          className="btn-danger bg-clay text-white hover:bg-[#a95e40]"
          disabled={busy}
          data-testid="confirm-end"
          onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              await onConfirm()
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Beenden fehlgeschlagen.')
              setBusy(false)
            }
          }}
        >
          {busy ? 'Wird beendet …' : 'Beenden und Daten löschen'}
        </button>
      </div>
    </Dialog>
  )
}

function WelcomeScreen({
  needsCode,
  error,
  onJoin,
}: {
  needsCode: boolean
  error?: string
  onJoin: (extra: { accessCode?: string; displayName?: string }) => void
}) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper px-4 py-10">
      <form
        className="panel w-full max-w-md p-6 sm:p-8"
        onSubmit={(e) => {
          e.preventDefault()
          onJoin({ displayName: name.trim() || undefined, accessCode: needsCode ? code : undefined })
        }}
        data-testid="welcome"
      >
        <LogoMark size={44} />
        <h1 className="mt-4 font-serif text-2xl font-semibold">Willkommen</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          Sie wurden zu einer gemeinsamen Sitzung auf dem Systembrett eingeladen. Sie brauchen kein Konto. Nach der Sitzung werden alle Daten gelöscht.
        </p>
        <label className="field-label mt-6" htmlFor="display-name">
          Anzeigename (optional)
        </label>
        <input id="display-name" className="input" maxLength={40} placeholder="z. B. «Gast» oder ein Vorname" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        <p className="mt-1.5 text-xs text-ink-3">Nur für die anderen in dieser Sitzung sichtbar. Sie müssen keinen echten Namen angeben.</p>
        {needsCode && (
          <>
            <label className="field-label mt-5" htmlFor="access-code">
              Zugangscode
            </label>
            <input id="access-code" className="input" required autoFocus value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
          </>
        )}
        {error && <p className="mt-3 rounded-xl bg-clay-light px-3 py-2 text-sm text-clay">{error}</p>}
        <button className="btn-primary mt-6 w-full" type="submit" data-testid="welcome-join">
          Sitzung beitreten
        </button>
        <p className="mt-4 text-center text-xs text-ink-3">
          <Link to="/datenschutz" className="underline">
            Datenschutz
          </Link>
        </p>
      </form>
    </div>
  )
}

function InfoScreen({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper px-4">
      <div className="panel max-w-md p-8 text-center" data-testid="info-screen">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-moss-light text-moss-dark">
          <Icon name="shield" size={24} />
        </div>
        <h1 className="mt-4 font-serif text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">{text}</p>
        <Link to="/" className="btn-primary mt-6">
          Zur Startseite
        </Link>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Logo } from '../components/Logo'
import { Icon } from '../components/Icon'
import { Link, navigate } from '../lib/router'
import { FigureShape } from '../board/FigureShape'
import { getTemplate } from '../domain/library'
import { isBackendConfigured } from '../sync/config'
import { createSession } from '../sync/sessionApi'

export function HomePage() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [joinOpen, setJoinOpen] = useState(false)
  const backend = isBackendConfigured()

  useEffect(() => {
    document.title = 'ConstellaBoard – Digitales Systembrett'
  }, [])

  const start = async () => {
    setError(null)
    if (!backend) {
      navigate('/brett')
      return
    }
    setBusy(true)
    try {
      const s = await createSession()
      navigate(`/s/${s.sessionId}#c=${s.coachToken}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Die Sitzung konnte nicht erstellt werden.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh bg-paper">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-1 text-sm">
          <Link to="/datenschutz" className="btn-ghost hidden sm:inline-flex">
            Datenschutz
          </Link>
          <Link to="/brett" className="btn-ghost">
            Übungsbrett
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="grid items-center gap-10 py-8 md:grid-cols-[1.1fr_1fr] md:py-16">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-moss-light px-3 py-1 text-xs font-medium text-moss-dark">
              <Icon name="shield" size={14} /> Ohne Konto · Daten werden nach der Sitzung gelöscht
            </p>
            <h1 className="font-serif text-4xl leading-[1.1] font-semibold tracking-tight text-ink sm:text-5xl">
              Das digitale Systembrett für Aufstellungen und Coaching
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-2">
              Stellen Sie Familien, Teams und innere Anteile gemeinsam mit Ihren Klientinnen und Klienten auf – in Echtzeit, im Browser, auf jedem Gerät.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button className="btn-primary px-6 py-3 text-base" onClick={start} disabled={busy} data-testid="new-session">
                <Icon name="plus" size={18} /> {busy ? 'Sitzung wird erstellt …' : 'Neue Sitzung'}
              </button>
              <button className="btn-secondary px-6 py-3 text-base" onClick={() => setJoinOpen((o) => !o)} data-testid="join-session">
                <Icon name="arrowRight" size={18} /> Sitzung beitreten
              </button>
            </div>
            {!backend && (
              <p className="mt-3 text-sm text-ink-3">
                Hinweis: Diese Installation ist noch nicht mit einem Server verbunden. «Neue Sitzung» öffnet ein lokales Übungsbrett.
              </p>
            )}
            {error && (
              <p role="alert" className="mt-3 rounded-xl bg-clay-light px-4 py-3 text-sm text-clay">
                {error}
              </p>
            )}
            {joinOpen && <JoinForm />}
          </div>
          <HeroBoard />
        </section>

        <section className="grid gap-4 pb-12 sm:grid-cols-3">
          {[
            { icon: 'link', title: '1. Sitzung erstellen', text: 'Als Coach starten Sie mit einem Klick eine Sitzung und erhalten einen geheimen Einladungslink.' },
            { icon: 'users', title: '2. Gemeinsam aufstellen', text: 'Ihr Gegenüber öffnet den Link – ohne Registrierung. Figuren, Blickrichtungen und Beziehungen werden live geteilt.' },
            { icon: 'shield', title: '3. Spurlos beenden', text: 'Beim Beenden werden Brett, Teilnehmende und Zugänge auf dem Server gelöscht. Nach 90 Minuten Inaktivität automatisch.' },
          ].map((c) => (
            <div key={c.title} className="panel p-6">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-moss-light text-moss-dark">
                <Icon name={c.icon as 'link'} size={20} />
              </div>
              <h2 className="font-serif text-lg font-semibold">{c.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{c.text}</p>
            </div>
          ))}
        </section>

        <section className="panel mb-12 grid gap-6 p-6 sm:p-8 md:grid-cols-[auto_1fr]">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-moss text-white">
            <Icon name="shield" size={24} />
          </div>
          <div>
            <h2 className="font-serif text-xl font-semibold">Datenschutz an erster Stelle</h2>
            <ul className="mt-3 grid gap-2 text-sm text-ink-2 sm:grid-cols-2">
              <li>✓ Keine Konten und keine Namen für Klientinnen und Klienten nötig</li>
              <li>✓ Keine Gesprächsprotokolle, keine dauerhafte Speicherung</li>
              <li>✓ Zugang nur über geheime Links, Tokens werden nur gehasht gespeichert</li>
              <li>✓ Keine Tracking- oder Werbedienste, keine externen Schriften</li>
            </ul>
            <Link to="/datenschutz" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-moss-dark hover:underline">
              Alle Details zum Datenschutz <Icon name="arrowRight" size={16} />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-6 text-center text-xs text-ink-3">
        ConstellaBoard · <Link to="/datenschutz" className="hover:underline">Datenschutz</Link> · Ersetzt keine therapeutische Fachperson
      </footer>
    </div>
  )
}

function JoinForm() {
  const [value, setValue] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const target = parseInvite(value)
    if (!target) {
      setErr('Bitte fügen Sie den vollständigen Einladungslink ein, den Sie von Ihrem Coach erhalten haben.')
      return
    }
    navigate(target)
  }
  return (
    <form onSubmit={submit} className="panel mt-4 p-4" data-testid="join-form">
      <label htmlFor="invite" className="field-label">
        Einladungslink
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input id="invite" className="input" placeholder="https://…/s/…#t=…" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" />
        <button className="btn-primary shrink-0" type="submit">
          Beitreten
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-clay">{err}</p>}
    </form>
  )
}

/** Liest einen Einladungslink und gibt den internen Pfad zurück. */
export function parseInvite(input: string): string | null {
  const s = input.trim()
  if (!s) return null
  try {
    const u = new URL(s, location.origin)
    const m = /^\/s\/([A-Za-z0-9_-]{8,64})\/?$/.exec(u.pathname)
    if (!m) return null
    if (!/[#&](t|c)=[A-Za-z0-9_-]{20,}/.test(u.hash)) return null
    return `/s/${m[1]}${u.hash}`
  } catch {
    return null
  }
}

function HeroBoard() {
  const figs: { type: string; x: number; y: number; rot: number; label: string }[] = [
    { type: 'frau', x: 120, y: 110, rot: 120, label: 'Mutter' },
    { type: 'mann', x: 300, y: 95, rot: 230, label: 'Vater' },
    { type: 'ich', x: 215, y: 250, rot: 10, label: 'Ich' },
    { type: 'kind-maedchen', x: 340, y: 240, rot: 290, label: 'Schwester' },
    { type: 'symbol-sonne', x: 80, y: 280, rot: 0, label: 'Ressource' },
  ]
  return (
    <div className="panel relative aspect-[4/3] overflow-hidden" aria-hidden="true">
      <svg viewBox="0 0 420 340" className="h-full w-full" style={{ backgroundImage: 'radial-gradient(circle, #e3dace 1px, transparent 1.2px)', backgroundSize: '22px 22px' }}>
        <line x1={150} y1={110} x2={270} y2={97} stroke="#c0704f" strokeWidth={2.5} strokeDasharray="1 0" />
        <path d="M150 115 L162 104 L174 118 L186 104 L198 118 L210 104 L222 118 L234 104 L246 118 L258 104 L270 100" stroke="#c0704f" strokeWidth={2.2} fill="none" />
        <line x1={135} y1={135} x2={200} y2={225} stroke="#5b7a5a" strokeWidth={2} />
        <line x1={140} y1={138} x2={205} y2={228} stroke="#5b7a5a" strokeWidth={2} />
        <line x1={240} y1={250} x2={318} y2={243} stroke="#c98a8f" strokeWidth={2.5} strokeDasharray="10 7" />
        <line x1={290} y1={120} x2={235} y2={225} stroke="#8a8580" strokeWidth={2} strokeDasharray="0.1 7" strokeLinecap="round" />
        {figs.map((f) => {
          const tpl = getTemplate(f.type)
          return (
            <g key={f.label} transform={`translate(${f.x} ${f.y})`}>
              <g transform={`rotate(${f.rot})`}>
                <FigureShape tpl={tpl} r={tpl.size * 0.85} color={tpl.color} />
              </g>
              <text y={tpl.size * 0.85 * 1.35 + 14} textAnchor="middle" fontSize={12} fill="#5c554c" stroke="#fffdf9" strokeWidth={3} paintOrder="stroke">
                {f.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

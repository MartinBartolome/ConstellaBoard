import { Link } from '../lib/router'
import { Logo } from '../components/Logo'

export function NotFoundPage({ title = 'Seite nicht gefunden', text = 'Diese Adresse gibt es nicht.' }: { title?: string; text?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-paper px-4 text-center">
      <Logo />
      <div className="panel max-w-md p-8">
        <h1 className="font-serif text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-ink-2">{text}</p>
        <Link to="/" className="btn-primary mt-6">
          Zur Startseite
        </Link>
      </div>
    </div>
  )
}

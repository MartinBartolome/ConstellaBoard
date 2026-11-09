import { lazy, Suspense } from 'react'
import { useLocation } from './lib/router'
import { HomePage } from './pages/HomePage'
import { PrivacyPage } from './pages/PrivacyPage'
import { NotFoundPage } from './pages/NotFoundPage'

const LocalBoardPage = lazy(() => import('./pages/LocalBoardPage').then((m) => ({ default: m.LocalBoardPage })))
const SessionPage = lazy(() => import('./pages/SessionPage').then((m) => ({ default: m.SessionPage })))

export function App() {
  const { path } = useLocation()
  let page: React.ReactNode
  const session = /^\/s\/([A-Za-z0-9_-]{8,64})\/?$/.exec(path)
  if (path === '/') page = <HomePage />
  else if (path === '/datenschutz') page = <PrivacyPage />
  else if (path === '/brett') page = <LocalBoardPage />
  else if (session) page = <SessionPage key={session[1]} sessionId={session[1]!} />
  else page = <NotFoundPage />
  return <Suspense fallback={<Loading />}>{page}</Suspense>
}

export function Loading({ text = 'Wird geladen …' }: { text?: string }) {
  return (
    <div className="flex h-dvh items-center justify-center bg-paper text-sm text-ink-3" role="status">
      <span className="mr-3 h-4 w-4 animate-spin rounded-full border-2 border-moss border-t-transparent" />
      {text}
    </div>
  )
}

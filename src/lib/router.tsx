import { useSyncExternalStore } from 'react'

/** Minimaler Router über die History-API (keine zusätzliche Abhängigkeit). */
const listeners = new Set<() => void>()

function notify() {
  for (const l of listeners) l()
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', notify)
  window.addEventListener('hashchange', notify)
}

export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  if (opts.replace) history.replaceState(null, '', to)
  else history.pushState(null, '', to)
  window.scrollTo(0, 0)
  notify()
}

export function useLocation(): { path: string; hash: string; search: string } {
  const href = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => location.pathname + location.search + location.hash,
  )
  const url = new URL(href, 'http://x')
  return { path: url.pathname, hash: url.hash, search: url.search }
}

export function Link({ to, className, children }: { to: string; className?: string; children: React.ReactNode }) {
  return (
    <a
      href={to}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        navigate(to)
      }}
    >
      {children}
    </a>
  )
}

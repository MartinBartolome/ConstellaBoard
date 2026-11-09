import { useSyncExternalStore } from 'react'

/**
 * Minimaler Router über die History-API (keine zusätzliche Abhängigkeit).
 * Berücksichtigt den Basis-Pfad (z. B. /ConstellaBoard/ auf GitHub Pages).
 */
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')
const listeners = new Set<() => void>()

function notify() {
  for (const l of listeners) l()
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', notify)
  window.addEventListener('hashchange', notify)
}

/** Interner Pfad → vollständige URL-Pfad mit Basis */
export function href(to: string): string {
  return BASE + to
}

/** Absolute URL für Links, die geteilt werden (Einladungen) */
export function absoluteUrl(to: string): string {
  return location.origin + href(to)
}

export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  if (opts.replace) history.replaceState(null, '', href(to))
  else history.pushState(null, '', href(to))
  window.scrollTo(0, 0)
  notify()
}

function stripBase(pathname: string): string {
  if (BASE && pathname.startsWith(BASE)) return pathname.slice(BASE.length) || '/'
  return pathname
}

export function useLocation(): { path: string; hash: string; search: string } {
  const full = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => location.pathname + location.search + location.hash,
  )
  const url = new URL(full, 'http://x')
  return { path: stripBase(url.pathname), hash: url.hash, search: url.search }
}

export function Link({ to, className, children }: { to: string; className?: string; children: React.ReactNode }) {
  return (
    <a
      href={href(to)}
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

/** Wandelt eine absolute Einladungs-URL in einen internen Pfad um. */
export function toInternalPath(pathname: string): string {
  return stripBase(pathname)
}

import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from './Icon'

/** Zugänglicher Dialog (Fokus, Escape, Hintergrund). */
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('input, button, [tabindex]')?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-2 backdrop-blur-[2px] sm:items-center sm:p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="panel max-h-[90dvh] w-full max-w-lg overflow-y-auto bg-surface p-6 shadow-lift">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="font-serif text-xl font-semibold">{title}</h2>
          <button className="icon-btn -mt-2 -mr-2" onClick={onClose} aria-label="Schliessen">
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

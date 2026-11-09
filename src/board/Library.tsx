import { useMemo, useRef, useState } from 'react'
import { templatesByCategory, type FigureTemplate } from '../domain/library'
import { FigureShape } from './FigureShape'
import { Icon } from '../components/Icon'

/**
 * Figurenbibliothek. Figuren können
 * - mit Maus/Stift/Touch auf das Brett gezogen werden (Pointer-basiert, auch auf Tablets)
 * - per Klick/Tippen in der Mitte des sichtbaren Bereichs abgelegt werden
 */
export function Library({
  onAdd,
  onDrop,
  onAddNote,
  disabled,
  layout = 'sidebar',
}: {
  onAdd: (type: string) => void
  onDrop: (type: string, clientX: number, clientY: number) => boolean
  onAddNote: () => void
  disabled: boolean
  layout?: 'sidebar' | 'sheet'
}) {
  const groups = useMemo(() => templatesByCategory(), [])
  const [query, setQuery] = useState('')
  const [ghost, setGhost] = useState<{ tpl: FigureTemplate; x: number; y: number } | null>(null)
  const drag = useRef<{ tpl: FigureTemplate; sx: number; sy: number; active: boolean; id: number } | null>(null)

  const filtered = groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => !query || `${i.name} ${g.label}`.toLowerCase().includes(query.toLowerCase())),
    }))
    .filter((g) => g.items.length > 0)

  const onPointerDown = (e: React.PointerEvent, tpl: FigureTemplate) => {
    if (disabled || e.button !== 0) return
    drag.current = { tpl, sx: e.clientX, sy: e.clientY, active: false, id: e.pointerId }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    if (!d.active) {
      const dx = e.clientX - d.sx
      const dy = e.clientY - d.sy
      // In der Seitenleiste horizontal ziehen, im unteren Blatt nach oben ziehen
      const intent = layout === 'sidebar' ? Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 0.6 : dy < -8 && Math.abs(dy) > Math.abs(dx) * 0.6
      if (!intent && Math.hypot(dx, dy) < 12) return
      if (!intent && e.pointerType === 'touch') {
        drag.current = null // Benutzer scrollt die Liste
        return
      }
      d.active = true
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    }
    setGhost({ tpl: d.tpl, x: e.clientX, y: e.clientY })
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    setGhost(null)
    if (!d || d.id !== e.pointerId) return
    if (d.active) onDrop(d.tpl.id, e.clientX, e.clientY)
    else onAdd(d.tpl.id)
  }

  const sheet = layout === 'sheet'

  return (
    <div className={`flex h-full flex-col ${sheet ? '' : 'w-full'}`} data-testid="library">
      {!sheet && (
        <div className="px-4 pt-4 pb-3">
          <h2 className="font-serif text-lg font-semibold text-ink">Figuren</h2>
          <p className="mt-0.5 text-xs text-ink-3">Auf das Brett ziehen oder antippen</p>
          <input
            className="input mt-3"
            placeholder="Figur suchen …"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Figur suchen"
          />
        </div>
      )}
      <div className={sheet ? 'flex gap-3 overflow-x-auto px-3 pb-3' : 'flex-1 overflow-y-auto px-3 pb-4'}>
        {filtered.map((g) => (
          <section key={g.category} className={sheet ? 'flex shrink-0 gap-2' : 'mb-4'}>
            {!sheet && <h3 className="mb-1.5 px-1 text-xs font-medium tracking-wide text-ink-3 uppercase">{g.label}</h3>}
            <div className={sheet ? 'flex gap-2' : 'grid grid-cols-3 gap-1.5'}>
              {g.items.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  disabled={disabled}
                  draggable={false}
                  title={tpl.name}
                  aria-label={`${tpl.name} hinzufügen`}
                  data-testid={`lib-${tpl.id}`}
                  onPointerDown={(e) => onPointerDown(e, tpl)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={() => {
                    drag.current = null
                    setGhost(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onAdd(tpl.id)
                    }
                  }}
                  className={`group flex flex-col items-center justify-center gap-1 rounded-xl border border-transparent bg-paper/60 transition hover:border-line hover:bg-white disabled:opacity-40 ${
                    sheet ? 'h-[76px] w-[76px] shrink-0' : 'aspect-square'
                  }`}
                  style={{ touchAction: sheet ? 'pan-x' : 'pan-y' }}
                >
                  <svg width="44" height="44" viewBox="-44 -44 88 88" className="pointer-events-none">
                    <FigureShape tpl={tpl} r={Math.min(30, tpl.size * 1.05)} color={tpl.color} />
                  </svg>
                  <span className="pointer-events-none line-clamp-1 max-w-full px-1 text-[10.5px] leading-tight text-ink-2">{tpl.name}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
        <section className={sheet ? 'flex shrink-0' : 'mb-4'}>
          {!sheet && <h3 className="mb-1.5 px-1 text-xs font-medium tracking-wide text-ink-3 uppercase">Notiz</h3>}
          <button
            type="button"
            disabled={disabled}
            onClick={onAddNote}
            data-testid="lib-note"
            className={`flex items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-[#fbf3d9] text-sm text-ink-2 hover:bg-[#f8ecc4] disabled:opacity-40 ${
              sheet ? 'h-[76px] w-[76px] flex-col text-[10.5px]' : 'w-full py-3'
            }`}
          >
            <Icon name="note" size={18} /> Textnotiz
          </button>
        </section>
      </div>
      {ghost && (
        <div className="pointer-events-none fixed z-50" style={{ left: ghost.x - 30, top: ghost.y - 30 }}>
          <svg width="60" height="60" viewBox="-44 -44 88 88" className="drop-shadow-lg">
            <FigureShape tpl={ghost.tpl} r={30} color={ghost.tpl.color} />
          </svg>
        </div>
      )}
    </div>
  )
}

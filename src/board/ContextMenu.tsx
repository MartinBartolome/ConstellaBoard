import { useEffect, useRef } from 'react'
import { Icon, type IconName } from '../components/Icon'
import { useBoardState, useEditor } from './editor'
import type { Actions } from './actions'

/** Kontextmenü (Rechtsklick oder langes Drücken auf Touch-Geräten). */
export function ContextMenu({ actions, onOpenProperties }: { actions: Actions; onOpenProperties: () => void }) {
  const ed = useEditor()
  const state = useBoardState(ed.store)
  const ref = useRef<HTMLDivElement>(null)
  const m = ed.contextMenu

  useEffect(() => {
    if (!m) return
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) ed.setContextMenu(null)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && ed.setContextMenu(null)
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('keydown', esc)
    }
  }, [m, ed])

  if (!m) return null
  const target = m.id ? state.entities[m.id]?.data : undefined
  const p = ed.perms
  const items: { icon: IconName; label: string; run: () => void; danger?: boolean; show: boolean }[] = target
    ? [
        { icon: 'settings', label: 'Eigenschaften', run: onOpenProperties, show: true },
        { icon: 'rotate', label: 'Um 45° drehen', run: () => actions.rotateBy(45), show: p.edit && target.kind !== 'connection' },
        { icon: 'copy', label: 'Duplizieren', run: () => actions.duplicate(), show: p.add && target.kind !== 'connection' },
        { icon: target.locked ? 'unlock' : 'lock', label: target.locked ? 'Entsperren' : 'Sperren', run: () => actions.toggleLock(), show: p.lock },
        { icon: target.visible ? 'eyeOff' : 'eye', label: target.visible ? 'Ausblenden' : 'Einblenden', run: () => actions.toggleVisible(), show: p.lock },
        { icon: 'group', label: 'Gruppieren', run: () => actions.group(), show: p.edit && ed.selection.size > 1 },
        { icon: 'front', label: 'Nach vorne', run: () => actions.reorder('front'), show: p.edit && target.kind !== 'connection' },
        { icon: 'trash', label: 'Löschen', run: () => actions.remove(), danger: true, show: p.delete },
      ]
    : [
        { icon: 'note', label: 'Notiz hier einfügen', run: () => actions.addNote({ x: m.boardX, y: m.boardY }), show: p.add },
        { icon: 'fit', label: 'Alles anzeigen', run: () => actions.fit(), show: true },
        { icon: 'library', label: 'Alles auswählen', run: () => actions.selectAll(), show: true },
      ]

  const x = Math.min(m.x, window.innerWidth - 230)
  const y = Math.min(m.y, window.innerHeight - items.filter((i) => i.show).length * 46 - 16)

  return (
    <div ref={ref} role="menu" className="panel fixed z-40 w-56 p-1.5 shadow-lift" style={{ left: Math.max(8, x), top: Math.max(8, y) }} data-testid="context-menu">
      {items
        .filter((i) => i.show)
        .map((i) => (
          <button
            key={i.label}
            role="menuitem"
            className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm ${i.danger ? 'text-clay hover:bg-clay-light' : 'text-ink hover:bg-paper-2'}`}
            onClick={() => {
              i.run()
              ed.setContextMenu(null)
            }}
          >
            <Icon name={i.icon} size={18} />
            {i.label}
          </button>
        ))}
    </div>
  )
}

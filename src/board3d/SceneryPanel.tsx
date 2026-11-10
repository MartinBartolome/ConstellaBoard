import { createPortal } from 'react-dom'
import { Icon } from '../components/Icon'
import { BOARD_STYLES, ENVIRONMENTS, asset, setViewSettings, useViewSettings } from './scenery'

/** Auswahl von Umgebung, Brett und Sprechblasen (persönliche Einstellung). */
export function SceneryPanel({ onClose }: { onClose: () => void }) {
  const s = useViewSettings()
  // Über allen anderen Panels (auch den Eigenschaften) anzeigen
  return createPortal(
    <div
      className="panel fixed right-3 bottom-20 z-50 flex max-h-[min(34rem,calc(100dvh-10rem))] w-[min(23rem,calc(100%-1.5rem))] flex-col overflow-hidden"
      role="dialog"
      aria-label="Umgebung und Brett"
      data-testid="scenery-panel"
    >
      <div className="flex items-start justify-between px-4 pt-3.5">
        <div>
          <h2 className="font-serif text-lg font-semibold text-ink">Umgebung</h2>
          <p className="text-xs text-ink-3">Nur für dich – andere sehen ihre eigene Wahl.</p>
        </div>
        <button className="icon-btn -mr-2 -mt-1" onClick={onClose} aria-label="Umgebung schliessen">
          <Icon name="close" />
        </button>
      </div>

      <div className="overflow-y-auto px-4 pt-3 pb-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ENVIRONMENTS.map((e) => {
            const active = s.environment === e.id
            return (
              <button
                key={e.id}
                onClick={() => setViewSettings({ environment: e.id })}
                aria-pressed={active}
                data-testid={`env-${e.id}`}
                className={`group overflow-hidden rounded-xl border text-left transition ${active ? 'border-moss ring-2 ring-moss/40' : 'border-line hover:border-line-strong'}`}
              >
                <div
                  className="aspect-[8/5] w-full bg-cover bg-center"
                  style={{ backgroundImage: e.backdrop ? `url(${asset(`thumbs/umgebung-${e.id}.jpg`)})` : e.swatch }}
                />
                <div className="px-2 py-1.5">
                  <div className="text-[13px] leading-tight font-semibold text-ink">{e.name}</div>
                  <div className="text-[11px] leading-tight text-ink-3">{e.mood}</div>
                </div>
              </button>
            )
          })}
        </div>

        <h3 className="field-label mt-4">Brett</h3>
        <div className="grid grid-cols-4 gap-2">
          {BOARD_STYLES.map((b) => {
            const active = s.board === b.id
            return (
              <button
                key={b.id}
                onClick={() => setViewSettings({ board: b.id })}
                aria-pressed={active}
                data-testid={`board-${b.id}`}
                className="flex flex-col items-center gap-1 rounded-xl p-1 text-[11px] leading-tight text-ink-2 hover:bg-paper-2"
              >
                <span
                  className={`block aspect-square w-full rounded-lg bg-cover shadow-inner ${active ? 'ring-2 ring-moss ring-offset-2 ring-offset-surface' : 'ring-1 ring-line'}`}
                  style={{ backgroundImage: `url(${asset(`thumbs/brett-${b.id}.jpg`)})`, backgroundColor: b.swatch }}
                />
                <span className={active ? 'font-semibold text-ink' : ''}>{b.name}</span>
              </button>
            )
          })}
        </div>

        <label className="mt-4 flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl bg-paper-2/60 px-3 py-2">
          <span className="flex items-center gap-2 text-sm text-ink">
            <Icon name="speech" size={18} />
            Sätze der Figuren zeigen
          </span>
          <input
            type="checkbox"
            className="h-5 w-5 accent-[var(--color-moss)]"
            checked={s.speech}
            onChange={(e) => setViewSettings({ speech: e.target.checked })}
            data-testid="toggle-speech"
          />
        </label>

        <p className="mt-3 text-[11px] leading-snug text-ink-3">Landschaften und Holztexturen: Poly Haven (CC0).</p>
      </div>
    </div>,
    document.body,
  )
}

import { useEffect, useRef, useState } from 'react'
import { CONNECTION_PRESETS, DIRECTION_LABELS, LINE_STYLE_LABELS, getPreset } from '../domain/connections'
import { getTemplate, PALETTE } from '../domain/library'
import type { BoardEntity, Connection, Figure, LineDirection, LineStyle, Note } from '../domain/types'
import { SCALE_MAX, SCALE_MIN, clampScale } from '../domain/commands'
import { Icon } from '../components/Icon'
import { useBoardState, useEditor } from './editor'
import type { Actions } from './actions'

/**
 * Eigenschaften der Auswahl. Texteingaben werden erst beim Verlassen des
 * Feldes bzw. Enter übernommen, damit die Undo-Historie nicht pro
 * Tastendruck wächst.
 */
export function PropertiesPanel({ actions, onClose }: { actions: Actions; onClose: () => void }) {
  const ed = useEditor()
  const state = useBoardState(ed.store)
  const items = [...ed.selection].map((id) => state.entities[id]?.data).filter((e): e is BoardEntity => !!e)
  if (items.length === 0) return null
  const single = items.length === 1 ? items[0]! : null
  const canEdit = ed.perms.edit && items.every((i) => !i.locked)

  const patchAll = (fields: Record<string, unknown>, filter: (e: BoardEntity) => boolean = () => true) => {
    const intents = items.filter((e) => !e.locked && filter(e)).map((e) => ({ op: 'patch' as const, id: e.id, fields }))
    if (intents.length) ed.store.execute(intents)
  }

  const title = single
    ? single.kind === 'figure'
      ? getTemplate(single.type).name
      : single.kind === 'connection'
        ? getPreset(single.type).name
        : 'Textnotiz'
    : `${items.length} Elemente`

  return (
    <div className="flex h-full flex-col" data-testid="properties">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="truncate font-serif text-base font-semibold">{title}</h2>
        <button className="icon-btn -mr-2" onClick={onClose} aria-label="Eigenschaften schliessen">
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {single?.kind === 'figure' && <FigureProps f={single} disabled={!canEdit} />}
        {single?.kind === 'connection' && <ConnectionProps c={single} disabled={!canEdit} />}
        {single?.kind === 'note' && <NoteProps n={single} disabled={!canEdit} />}

        {!single && (
          <div>
            <span className="field-label">Farbe für alle</span>
            <ColorPicker value="" onChange={(color) => patchAll({ color })} disabled={!canEdit} />
          </div>
        )}

        <div>
          <span className="field-label">Aktionen</span>
          <div className="grid grid-cols-2 gap-2 [&>button]:px-2 [&>button]:text-[13px] [&>button]:whitespace-nowrap">
            {items.some((i) => i.kind !== 'connection') && ed.perms.add && (
              <button className="btn-secondary" onClick={() => actions.duplicate()}>
                <Icon name="copy" size={17} /> Duplizieren
              </button>
            )}
            {ed.perms.lock && (
              <button className="btn-secondary" onClick={() => actions.toggleLock()} aria-pressed={items.every((i) => i.locked)}>
                <Icon name={items.every((i) => i.locked) ? 'unlock' : 'lock'} size={17} />
                {items.every((i) => i.locked) ? 'Entsperren' : 'Sperren'}
              </button>
            )}
            {ed.perms.lock && (
              <button className="btn-secondary" onClick={() => actions.toggleVisible()}>
                <Icon name={items.every((i) => i.visible) ? 'eyeOff' : 'eye'} size={17} />
                {items.every((i) => i.visible) ? 'Ausblenden' : 'Einblenden'}
              </button>
            )}
            {items.length > 1 && ed.perms.edit && (
              <button className="btn-secondary" onClick={() => actions.group()}>
                <Icon name="group" size={17} /> Gruppieren
              </button>
            )}
            {items.some((i) => i.kind !== 'connection' && i.groupId) && ed.perms.edit && (
              <button className="btn-secondary" onClick={() => actions.ungroup()}>
                <Icon name="ungroup" size={17} /> Lösen
              </button>
            )}
            {items.some((i) => i.kind !== 'connection') && ed.perms.edit && (
              <>
                <button className="btn-secondary" onClick={() => actions.reorder('front')}>
                  <Icon name="front" size={17} /> Nach vorne
                </button>
                <button className="btn-secondary" onClick={() => actions.reorder('back')}>
                  <Icon name="back" size={17} /> Nach hinten
                </button>
              </>
            )}
            {ed.perms.delete && (
              <button className="btn-danger col-span-2" onClick={() => actions.remove()} data-testid="delete-selection">
                <Icon name="trash" size={17} /> Löschen
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function FigureProps({ f, disabled }: { f: Figure; disabled: boolean }) {
  const ed = useEditor()
  const patch = (fields: Partial<Figure>) => ed.store.execute([{ op: 'patch', id: f.id, fields }])
  return (
    <>
      <LabelField
        key={f.id}
        value={f.label}
        disabled={disabled}
        onCommit={(label) => patch({ label })}
        placeholder="z. B. Vater, Ich, Firma …"
        focusToken={ed.labelFocusToken}
      />
      <div>
        <span className="field-label">Farbe</span>
        <ColorPicker value={f.color} onChange={(color) => patch({ color })} disabled={disabled} />
      </div>
      <RangeField
        label="Drehung"
        value={f.rotation}
        min={0}
        max={359}
        step={1}
        unit="°"
        disabled={disabled}
        onCommit={(rotation) => patch({ rotation })}
        testId="rotation-input"
      />
      <RangeField
        label="Grösse"
        value={Math.round(f.scale * 100)}
        min={SCALE_MIN * 100}
        max={SCALE_MAX * 100}
        step={5}
        unit="%"
        disabled={disabled}
        onCommit={(v) => patch({ scale: clampScale(v / 100) })}
      />
    </>
  )
}

function NoteProps({ n, disabled }: { n: Note; disabled: boolean }) {
  const ed = useEditor()
  const patch = (fields: Partial<Note>) => ed.store.execute([{ op: 'patch', id: n.id, fields }])
  return (
    <>
      <button className="btn-secondary w-full" disabled={disabled} onClick={() => ed.setEditingNote(n.id)}>
        <Icon name="note" size={17} /> Text bearbeiten
      </button>
      <div>
        <span className="field-label">Hintergrund</span>
        <div className="flex flex-wrap gap-2">
          {['#fbf3d9', '#e3ebdd', '#e2ecf1', '#f6e3d9', '#efe4ee', '#ffffff'].map((c) => (
            <Swatch key={c} color={c} active={n.color === c} onClick={() => patch({ color: c })} disabled={disabled} />
          ))}
        </div>
      </div>
      <RangeField label="Breite" value={n.width} min={100} max={400} step={10} unit="" disabled={disabled} onCommit={(width) => patch({ width })} />
      <RangeField label="Schriftgrösse" value={Math.round(n.scale * 100)} min={60} max={250} step={10} unit="%" disabled={disabled} onCommit={(v) => patch({ scale: v / 100 })} />
    </>
  )
}

function ConnectionProps({ c, disabled }: { c: Connection; disabled: boolean }) {
  const ed = useEditor()
  const patch = (fields: Partial<Connection>) => ed.store.execute([{ op: 'patch', id: c.id, fields }])
  return (
    <>
      <div>
        <span className="field-label">Beziehungsart</span>
        <select
          className="input"
          value={c.type}
          disabled={disabled}
          data-testid="connection-type"
          onChange={(e) => {
            const p = getPreset(e.target.value as Connection['type'])
            patch({ type: p.type, color: p.color, width: p.width, style: p.style, direction: p.direction })
          }}
        >
          {CONNECTION_PRESETS.map((p) => (
            <option key={p.type} value={p.type}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <LabelField key={c.id} value={c.label} disabled={disabled} onCommit={(label) => patch({ label })} placeholder="z. B. Loyalität" focusToken={ed.labelFocusToken} />
      <div>
        <span className="field-label">Linienfarbe</span>
        <ColorPicker value={c.color} onChange={(color) => patch({ color })} disabled={disabled} />
      </div>
      <RangeField label="Linienstärke" value={c.width} min={1} max={10} step={0.5} unit="" disabled={disabled} onCommit={(width) => patch({ width })} />
      <div>
        <span className="field-label">Linienart</span>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(LINE_STYLE_LABELS) as LineStyle[]).map((s) => (
            <button
              key={s}
              disabled={disabled}
              onClick={() => patch({ style: s })}
              aria-pressed={c.style === s}
              className={`rounded-lg border px-2 py-2 text-xs ${c.style === s ? 'border-moss bg-moss-light text-moss-dark' : 'border-line bg-white text-ink-2 hover:border-line-strong'}`}
            >
              {LINE_STYLE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="field-label">Richtung</span>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(DIRECTION_LABELS) as LineDirection[]).map((d) => (
            <button
              key={d}
              disabled={disabled}
              onClick={() => patch({ direction: d })}
              aria-pressed={c.direction === d}
              className={`rounded-lg border px-2 py-2 text-xs ${c.direction === d ? 'border-moss bg-moss-light text-moss-dark' : 'border-line bg-white text-ink-2 hover:border-line-strong'}`}
            >
              {DIRECTION_LABELS[d]}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

let handledFocusToken = 0

function LabelField({
  value,
  onCommit,
  disabled,
  placeholder,
  focusToken,
}: {
  value: string
  onCommit: (v: string) => void
  disabled: boolean
  placeholder: string
  focusToken: number
}) {
  const [v, setV] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => setV(value), [value])
  useEffect(() => {
    if (focusToken > handledFocusToken) {
      handledFocusToken = focusToken
      ref.current?.focus()
      ref.current?.select()
    }
  }, [focusToken])
  const commit = () => {
    const t = v.trim().slice(0, 80)
    if (t !== value) onCommit(t)
  }
  return (
    <div>
      <label className="field-label" htmlFor="label-input">
        Beschriftung
      </label>
      <input
        ref={ref}
        id="label-input"
        data-testid="label-input"
        className="input"
        value={v}
        maxLength={80}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit()
            ;(e.target as HTMLInputElement).blur()
          }
          if (e.key === 'Escape') {
            setV(value)
            ;(e.target as HTMLInputElement).blur()
          }
        }}
      />
    </div>
  )
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  unit,
  disabled,
  onCommit,
  testId,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  disabled: boolean
  onCommit: (v: number) => void
  testId?: string
}) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  const commit = (n: number) => {
    if (n !== value && Number.isFinite(n)) onCommit(Math.min(max, Math.max(min, n)))
  }
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="field-label">{label}</span>
        <span className="text-xs text-ink-2 tabular-nums">
          {Math.round(v * 10) / 10}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        disabled={disabled}
        data-testid={testId}
        aria-label={label}
        onChange={(e) => setV(Number(e.target.value))}
        onPointerUp={() => commit(v)}
        onKeyUp={() => commit(v)}
        onBlur={() => commit(v)}
        className="h-11 w-full accent-[#5b7a5a]"
      />
    </div>
  )
}

function ColorPicker({ value, onChange, disabled }: { value: string; onChange: (c: string) => void; disabled: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PALETTE.map((p) => (
        <Swatch key={p.value} color={p.value} name={p.name} active={value === p.value} onClick={() => onChange(p.value)} disabled={disabled} />
      ))}
      <label className={`relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-line bg-white ${disabled ? 'opacity-40' : 'cursor-pointer'}`} title="Eigene Farbe">
        <Icon name="plus" size={16} className="text-ink-2" />
        <input
          type="color"
          className="absolute inset-0 cursor-pointer opacity-0"
          disabled={disabled}
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#5b7a5a'}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Eigene Farbe wählen"
        />
      </label>
    </div>
  )
}

function Swatch({ color, name, active, onClick, disabled }: { color: string; name?: string; active: boolean; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      title={name}
      aria-label={name ? `Farbe ${name}` : `Farbe ${color}`}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`h-9 w-9 rounded-full border transition disabled:opacity-40 ${active ? 'ring-2 ring-moss ring-offset-2 ring-offset-surface' : 'border-black/10 hover:scale-105'}`}
      style={{ background: color }}
    />
  )
}

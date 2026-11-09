import { memo, useEffect, useRef, useState } from 'react'
import type { Note } from '../domain/types'
import { noteSize } from './geometry'
import { useEditor } from './editor'

export const NoteView = memo(function NoteView({ n, selected, editing }: { n: Note; selected: boolean; editing: boolean }) {
  const { w, h } = noteSize(n)
  return (
    <g
      data-entity={n.id}
      data-kind="note"
      data-testid="note"
      transform={`translate(${n.x} ${n.y}) rotate(${n.rotation})`}
      opacity={n.visible ? 1 : 0.35}
      style={{ cursor: n.locked ? 'not-allowed' : 'move' }}
    >
      <rect x={-w / 2 + 2} y={-h / 2 + 4} width={w} height={h} rx={10} fill="rgb(60 45 30 / 0.10)" />
      <rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        rx={10}
        fill={n.color}
        stroke={selected ? '#5b7a5a' : '#e6d9b8'}
        strokeWidth={selected ? 2 : 1}
      />
      {editing ? (
        <NoteEditor n={n} w={w} h={h} />
      ) : (
        <foreignObject x={-w / 2} y={-h / 2} width={w} height={h} style={{ pointerEvents: 'none' }}>
          <div
            style={{ fontSize: 14 * n.scale, lineHeight: 1.4, padding: `${10 * n.scale}px ${12 * n.scale}px` }}
            className="h-full overflow-hidden break-words whitespace-pre-wrap text-ink"
          >
            {n.text || <span className="text-ink-3 italic">Notiz – doppeltippen zum Schreiben</span>}
          </div>
        </foreignObject>
      )}
    </g>
  )
})

function NoteEditor({ n, w, h }: { n: Note; w: number; h: number }) {
  const ed = useEditor()
  const [text, setText] = useState(n.text)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const commit = () => {
    if (text !== n.text) ed.store.execute([{ op: 'patch', id: n.id, fields: { text } }])
    ed.setEditingNote(null)
  }
  return (
    <foreignObject x={-w / 2} y={-h / 2} width={w} height={Math.max(h, 120)}>
      <textarea
        ref={ref}
        aria-label="Notiztext"
        value={text}
        maxLength={1000}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) commit()
        }}
        style={{ fontSize: 14 * n.scale, lineHeight: 1.4, background: n.color }}
        className="h-full w-full resize-none rounded-[10px] border-2 border-moss px-3 py-2.5 text-ink outline-none"
      />
    </foreignObject>
  )
}

import type { BoardState, Figure, Note } from '../domain/types'
import { useEditor } from './editor'
import { figureRadius, noteSize, type Rect } from './geometry'

/** Auswahlrahmen und Griffe zum Drehen und Skalieren. */
export function SelectionOverlay({ bounds, k, state }: { bounds: Rect | null; k: number; state: BoardState }) {
  const { selection, perms, tool } = useEditor()
  if (!bounds || tool === 'connect') return null
  const ids = [...selection]
  const single = ids.length === 1 ? (state.entities[ids[0]!]?.data as Figure | Note | undefined) : undefined
  const handleR = 11 / k
  const pad = 8 / k

  if (single && single.kind !== undefined && (single.kind === 'figure' || single.kind === 'note')) {
    if (!perms.edit || single.locked) return null
    const r = single.kind === 'figure' ? figureRadius(single) * 1.38 : Math.max(noteSize(single).w, noteSize(single).h) / 2 + 6
    const rot = (single.rotation * Math.PI) / 180
    // Drehgriff in Blickrichtung, damit die Bedienung intuitiv ist
    const hx = single.x + Math.sin(rot) * (r + 26 / k)
    const hy = single.y - Math.cos(rot) * (r + 26 / k)
    const sx = single.x + r * 0.72
    const sy = single.y + r * 0.72
    return (
      <g>
        <line x1={single.x + Math.sin(rot) * r} y1={single.y - Math.cos(rot) * r} x2={hx} y2={hy} stroke="#5b7a5a" strokeWidth={1.5 / k} />
        <g data-handle="rotate" data-for={single.id} data-testid="rotate-handle" style={{ cursor: 'grab' }}>
          <circle cx={hx} cy={hy} r={handleR * 1.8} fill="transparent" />
          <circle cx={hx} cy={hy} r={handleR} fill="#fffdf9" stroke="#5b7a5a" strokeWidth={1.8 / k} />
          <path
            transform={`translate(${hx} ${hy}) scale(${0.55 / k}) translate(-12 -12)`}
            d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"
            fill="none"
            stroke="#5b7a5a"
            strokeWidth={2.4}
            strokeLinecap="round"
          />
        </g>
        <g data-handle="scale" data-for={single.id} data-testid="scale-handle" style={{ cursor: 'nwse-resize' }}>
          <circle cx={sx} cy={sy} r={handleR * 1.8} fill="transparent" />
          <rect x={sx - handleR * 0.8} y={sy - handleR * 0.8} width={handleR * 1.6} height={handleR * 1.6} rx={3 / k} fill="#fffdf9" stroke="#5b7a5a" strokeWidth={1.8 / k} />
        </g>
      </g>
    )
  }

  if (ids.length < 2) return null
  return (
    <rect
      x={bounds.x - pad}
      y={bounds.y - pad}
      width={bounds.w + pad * 2}
      height={bounds.h + pad * 2}
      rx={10 / k}
      fill="none"
      stroke="#5b7a5a"
      strokeWidth={1.4 / k}
      strokeDasharray={`${6 / k} ${4 / k}`}
      style={{ pointerEvents: 'none' }}
    />
  )
}

import { memo } from 'react'
import { getPreset } from '../domain/connections'
import type { BoardEntity, Connection, ConnectionType, LineDirection, LineStyle } from '../domain/types'
import { anchorOf, type Point } from './geometry'

/**
 * Verbindungslinie zwischen zwei Elementen. Die Endpunkte werden bei jeder
 * Darstellung aus den aktuellen Positionen berechnet, die Linie bleibt also
 * automatisch an den Figuren verankert.
 */
export const ConnectionView = memo(function ConnectionView({
  c,
  from,
  to,
  selected,
  k,
}: {
  c: Connection
  from: BoardEntity | undefined
  to: BoardEntity | undefined
  selected: boolean
  k: number
}) {
  const a = anchorOf(from)
  const b = anchorOf(to)
  if (!a || !b) return null
  const seg = trim(a, b, a.r + 6, b.r + 6)
  if (!seg) return null
  const [p, q] = seg
  const mx = (p.x + q.x) / 2
  const my = (p.y + q.y) / 2
  return (
    <g data-entity={c.id} data-kind="connection" data-testid="connection" data-type={c.type} opacity={c.visible ? 1 : 0.35}>
      {/* breite unsichtbare Trefferfläche */}
      <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="transparent" strokeWidth={Math.max(18, 22 / k)} strokeLinecap="round" />
      {selected && <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="rgb(91 122 90 / 0.25)" strokeWidth={c.width + 10} strokeLinecap="round" />}
      <StyledLine p={p} q={q} color={c.color} width={c.width} style={c.style} />
      <Arrows p={p} q={q} color={c.color} width={c.width} direction={c.direction} />
      {c.label && (
        <g transform={`translate(${mx} ${my})`} style={{ pointerEvents: 'none' }}>
          <rect x={-labelWidth(c.label) / 2} y={-11} width={labelWidth(c.label)} height={22} rx={11} fill="#fffdf9" stroke="#e3dace" />
          <text y={4.5} textAnchor="middle" fontSize={12.5} fill="#5c554c">
            {c.label}
          </text>
        </g>
      )}
    </g>
  )
})

export function ConnectionPreview({ from, to, type }: { from: BoardEntity; to: Point; type: ConnectionType }) {
  const a = anchorOf(from)
  if (!a) return null
  const p = getPreset(type)
  const seg = trim(a, to, a.r + 6, 0)
  if (!seg) return null
  return (
    <g opacity={0.6} style={{ pointerEvents: 'none' }}>
      <StyledLine p={seg[0]} q={seg[1]} color={p.color} width={p.width} style={p.style} />
    </g>
  )
}

function StyledLine({ p, q, color, width, style }: { p: Point; q: Point; color: string; width: number; style: LineStyle }) {
  const base = { stroke: color, strokeWidth: width, strokeLinecap: 'round' as const, fill: 'none', style: { pointerEvents: 'none' as const } }
  switch (style) {
    case 'dashed':
      return <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} {...base} strokeDasharray={`${width * 4} ${width * 3}`} />
    case 'dotted':
      return <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} {...base} strokeDasharray={`0.1 ${width * 3.5}`} strokeWidth={width * 1.6} />
    case 'zigzag':
      return <path d={zigzag(p, q, Math.max(6, width * 3))} {...base} strokeLinejoin="round" />
    case 'double': {
      const { nx, ny } = normal(p, q)
      const o = width * 1.1
      return (
        <g>
          <line x1={p.x + nx * o} y1={p.y + ny * o} x2={q.x + nx * o} y2={q.y + ny * o} {...base} strokeWidth={width * 0.7} />
          <line x1={p.x - nx * o} y1={p.y - ny * o} x2={q.x - nx * o} y2={q.y - ny * o} {...base} strokeWidth={width * 0.7} />
        </g>
      )
    }
    default:
      return <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} {...base} />
  }
}

function Arrows({ p, q, color, width, direction }: { p: Point; q: Point; color: string; width: number; direction: LineDirection }) {
  if (direction === 'none') return null
  const s = 6 + width * 2
  return (
    <g style={{ pointerEvents: 'none' }}>
      {(direction === 'forward' || direction === 'both') && <path d={arrowHead(p, q, s)} fill={color} />}
      {(direction === 'backward' || direction === 'both') && <path d={arrowHead(q, p, s)} fill={color} />}
    </g>
  )
}

function arrowHead(from: Point, tip: Point, s: number): string {
  const a = Math.atan2(tip.y - from.y, tip.x - from.x)
  const l = { x: tip.x - s * Math.cos(a - 0.45), y: tip.y - s * Math.sin(a - 0.45) }
  const r = { x: tip.x - s * Math.cos(a + 0.45), y: tip.y - s * Math.sin(a + 0.45) }
  return `M${tip.x} ${tip.y} L${l.x} ${l.y} L${r.x} ${r.y} Z`
}

function normal(p: Point, q: Point) {
  const len = Math.hypot(q.x - p.x, q.y - p.y) || 1
  return { nx: -(q.y - p.y) / len, ny: (q.x - p.x) / len }
}

function zigzag(p: Point, q: Point, amp: number): string {
  const len = Math.hypot(q.x - p.x, q.y - p.y)
  const ux = (q.x - p.x) / (len || 1)
  const uy = (q.y - p.y) / (len || 1)
  const { nx, ny } = normal(p, q)
  const step = amp * 1.4
  const n = Math.max(2, Math.floor(len / step))
  let d = `M${p.x} ${p.y}`
  for (let i = 1; i < n; i++) {
    const t = (i / n) * len
    const o = i % 2 === 0 ? -amp : amp
    d += ` L${p.x + ux * t + nx * o} ${p.y + uy * t + ny * o}`
  }
  return d + ` L${q.x} ${q.y}`
}

function trim(a: Point, b: Point, ra: number, rb: number): [Point, Point] | null {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  if (len <= ra + rb + 2) return null
  const ux = (b.x - a.x) / len
  const uy = (b.y - a.y) / len
  return [
    { x: a.x + ux * ra, y: a.y + uy * ra },
    { x: b.x - ux * rb, y: b.y - uy * rb },
  ]
}

function labelWidth(s: string): number {
  return Math.min(220, 20 + s.length * 7)
}

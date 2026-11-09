import { memo } from 'react'
import type { FigureTemplate } from '../domain/library'

/**
 * Zeichnet eine Figur zentriert im Ursprung, Blickrichtung nach oben (−y).
 * r = Radius in Brett-Einheiten.
 */
export const FigureShape = memo(function FigureShape({
  tpl,
  r,
  color,
}: {
  tpl: FigureTemplate
  r: number
  color: string
}) {
  const stroke = shade(color, -0.28)
  const light = shade(color, 0.35)
  const sw = Math.max(1.5, r * 0.07)
  const common = { fill: color, stroke, strokeWidth: sw, strokeLinejoin: 'round' as const }
  return (
    <g>
      {/* weicher Schatten */}
      <circle cx={r * 0.04} cy={r * 0.1} r={r * 0.9} fill="rgb(60 45 30 / 0.10)" />
      {body(tpl, r, common, light, stroke, sw)}
      {tpl.directional && nose(tpl, r, stroke)}
      {glyph(tpl.glyph, r, light, stroke)}
    </g>
  )
})

type Common = { fill: string; stroke: string; strokeWidth: number; strokeLinejoin: 'round' }

function body(tpl: FigureTemplate, r: number, c: Common, light: string, stroke: string, sw: number) {
  const color = c.fill
  switch (tpl.shape) {
    case 'person-square':
    case 'person-small-square':
      return <rect x={-r * 0.86} y={-r * 0.86} width={r * 1.72} height={r * 1.72} rx={r * 0.32} {...c} />
    case 'person-circle':
    case 'person-small-circle':
      return <circle r={r * 0.92} {...c} />
    case 'person-hex':
      return <polygon points={poly(6, r * 0.95, 0)} {...c} />
    case 'baby':
      return <ellipse rx={r * 0.8} ry={r * 0.95} {...c} />
    case 'animal':
      return (
        <g>
          <ellipse cy={r * 0.25} rx={r * 0.62} ry={r * 0.55} {...c} />
          <circle cx={-r * 0.55} cy={-r * 0.35} r={r * 0.26} {...c} />
          <circle cx={-r * 0.18} cy={-r * 0.68} r={r * 0.26} {...c} />
          <circle cx={r * 0.18} cy={-r * 0.68} r={r * 0.26} {...c} />
          <circle cx={r * 0.55} cy={-r * 0.35} r={r * 0.26} {...c} />
        </g>
      )
    case 'family': {
      const n = tpl.glyph === '2' ? 2 : 3
      const pts = n === 2 ? [[-0.42, 0], [0.42, 0]] : [[-0.5, 0.28], [0.5, 0.28], [0, -0.5]]
      return (
        <g>
          <circle r={r} fill={light} stroke={stroke} strokeWidth={sw * 0.7} strokeDasharray={`${r * 0.12} ${r * 0.1}`} />
          {pts.map(([x, y], i) => (
            <circle key={i} cx={x! * r} cy={y! * r} r={r * (n === 2 ? 0.4 : 0.36)} {...c} />
          ))}
        </g>
      )
    }
    case 'heart':
      return (
        <path
          d={`M0 ${r * 0.85} C ${-r * 1.4} ${-r * 0.1}, ${-r * 0.7} ${-r * 1.1}, 0 ${-r * 0.45} C ${r * 0.7} ${-r * 1.1}, ${r * 1.4} ${-r * 0.1}, 0 ${r * 0.85} Z`}
          {...c}
        />
      )
    case 'star':
      return <polygon points={star(5, r, r * 0.45)} {...c} />
    case 'sun':
      return (
        <g>
          <polygon points={star(12, r, r * 0.72)} {...c} />
          <circle r={r * 0.5} fill={light} stroke={stroke} strokeWidth={sw * 0.7} />
        </g>
      )
    case 'tree':
      return (
        <g>
          <circle cy={-r * 0.15} r={r * 0.78} {...c} />
          <rect x={-r * 0.14} y={r * 0.5} width={r * 0.28} height={r * 0.45} rx={r * 0.06} fill={stroke} />
        </g>
      )
    case 'house':
      return <path d={`M0 ${-r * 0.95} L${r * 0.9} ${-r * 0.1} V${r * 0.85} H${-r * 0.9} V${-r * 0.1} Z`} {...c} />
    case 'stone':
      return (
        <path
          d={`M${-r * 0.9} ${r * 0.2} C ${-r} ${-r * 0.6}, ${-r * 0.2} ${-r * 0.9}, ${r * 0.35} ${-r * 0.75} C ${r} ${-r * 0.55}, ${r} ${r * 0.4}, ${r * 0.5} ${r * 0.75} C 0 ${r}, ${-r * 0.75} ${r * 0.85}, ${-r * 0.9} ${r * 0.2} Z`}
          {...c}
        />
      )
    case 'flame':
      return (
        <path
          d={`M0 ${-r} C ${r * 0.3} ${-r * 0.4}, ${r * 0.95} ${-r * 0.1}, ${r * 0.75} ${r * 0.45} C ${r * 0.55} ${r * 0.95}, ${-r * 0.55} ${r * 0.95}, ${-r * 0.75} ${r * 0.45} C ${-r * 0.9} 0, ${-r * 0.3} ${-r * 0.3}, 0 ${-r} Z`}
          {...c}
        />
      )
    case 'question':
      return (
        <g>
          <circle r={r * 0.92} {...c} />
          <text y={r * 0.36} textAnchor="middle" fontSize={r * 1.1} fontWeight={700} fill={light} fontFamily="Georgia, serif">
            ?
          </text>
        </g>
      )
    case 'flag':
      return (
        <g>
          <circle r={r * 0.92} fill={light} stroke={stroke} strokeWidth={sw} />
          <path d={`M${-r * 0.3} ${r * 0.55} V${-r * 0.6} L${r * 0.5} ${-r * 0.35} L${-r * 0.3} ${-r * 0.08}`} fill={color} stroke={stroke} strokeWidth={sw} />
        </g>
      )
    case 'eye':
      return (
        <g>
          <path d={`M${-r} 0 Q 0 ${-r * 1.1} ${r} 0 Q 0 ${r * 1.1} ${-r} 0 Z`} fill={light} stroke={stroke} strokeWidth={sw} />
          <circle cy={-r * 0.05} r={r * 0.35} fill={color} />
        </g>
      )
    case 'triangle':
      return <polygon points={poly(3, r, 0)} {...c} />
    case 'diamond':
      return <polygon points={poly(4, r, 0)} {...c} />
    case 'ring':
      return <circle r={r * 0.75} fill="none" stroke={color} strokeWidth={r * 0.32} />
    case 'cloud':
      return (
        <path
          d={`M${-r * 0.7} ${r * 0.5} A ${r * 0.38} ${r * 0.38} 0 0 1 ${-r * 0.75} ${-r * 0.2} A ${r * 0.45} ${r * 0.45} 0 0 1 ${-r * 0.05} ${-r * 0.6} A ${r * 0.45} ${r * 0.45} 0 0 1 ${r * 0.75} ${-r * 0.2} A ${r * 0.38} ${r * 0.38} 0 0 1 ${r * 0.7} ${r * 0.5} Z`}
          {...c}
        />
      )
    case 'block':
      return <rect x={-r * 0.95} y={-r * 0.55} width={r * 1.9} height={r * 1.1} rx={r * 0.12} {...c} />
    case 'wave':
      return (
        <g>
          <circle r={r * 0.95} fill={light} stroke={stroke} strokeWidth={sw * 0.7} />
          <path
            d={`M${-r * 0.7} 0 q ${r * 0.175} ${-r * 0.35} ${r * 0.35} 0 t ${r * 0.35} 0 t ${r * 0.35} 0 t ${r * 0.35} 0`}
            fill="none"
            stroke={color}
            strokeWidth={r * 0.18}
            strokeLinecap="round"
          />
        </g>
      )
  }
}

function nose(tpl: FigureTemplate, r: number, stroke: string) {
  // Spitze ragt aus der Figur heraus, damit die Blickrichtung klar erkennbar ist
  const top = tpl.shape === 'triangle' ? -r * 1.25 : -r * 1.28
  const base = tpl.shape === 'animal' ? -r * 0.9 : -r * 0.78
  const w = r * 0.32
  return <path d={`M${-w} ${base} L0 ${top} L${w} ${base} Z`} fill={stroke} stroke={stroke} strokeWidth={1} strokeLinejoin="round" />
}

function glyph(g: string | undefined, r: number, light: string, stroke: string) {
  if (g === 'ring') return <circle r={r * 0.38} fill="none" stroke={light} strokeWidth={r * 0.12} />
  if (g === 'dot') return <circle r={r * 0.26} fill={light} stroke={stroke} strokeWidth={r * 0.05} />
  return null
}

function poly(n: number, r: number, rot: number): string {
  const pts: string[] = []
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2 - Math.PI / 2
    pts.push(`${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`)
  }
  return pts.join(' ')
}

function star(n: number, ro: number, ri: number): string {
  const pts: string[] = []
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? ro : ri
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2
    pts.push(`${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`)
  }
  return pts.join(' ')
}

/** Hellt (amount > 0) oder dunkelt (amount < 0) eine Hex-Farbe ab. */
export function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1]!, 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount)),
  )
  return '#' + ch.map((v) => v.toString(16).padStart(2, '0')).join('')
}

/** Gibt eine lesbare Textfarbe für einen Hintergrund zurück. */
export function contrastText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#2f2b26'
  const n = parseInt(m[1]!, 16)
  const l = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
  return l > 150 ? '#2f2b26' : '#ffffff'
}

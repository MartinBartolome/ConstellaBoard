import { memo } from 'react'
import { getTemplate } from '../domain/library'
import type { Figure } from '../domain/types'
import { FigureShape } from './FigureShape'

export const FigureView = memo(function FigureView({
  f,
  selected,
  connectSource,
}: {
  f: Figure
  selected: boolean
  connectSource: boolean
}) {
  const tpl = getTemplate(f.type)
  const r = tpl.size * f.scale
  return (
    <g
      data-entity={f.id}
      data-kind="figure"
      data-testid="figure"
      data-type={f.type}
      data-label={f.label}
      transform={`translate(${f.x} ${f.y})`}
      opacity={f.visible ? 1 : 0.35}
      style={{ cursor: f.locked ? 'not-allowed' : 'move' }}
      role="img"
      aria-label={`${tpl.name}${f.label ? `: ${f.label}` : ''}`}
    >
      {/* grössere, unsichtbare Trefferfläche für Touch */}
      <circle r={Math.max(r * 1.25, 26)} fill="transparent" />
      {(selected || connectSource) && (
        <circle
          r={r * 1.38}
          fill={connectSource ? 'rgb(192 112 79 / 0.12)' : 'rgb(91 122 90 / 0.10)'}
          stroke={connectSource ? '#c0704f' : '#5b7a5a'}
          strokeWidth={1.5}
          strokeDasharray={connectSource ? '5 4' : undefined}
        />
      )}
      <g transform={`rotate(${f.rotation})`}>
        <FigureShape tpl={tpl} r={r} color={f.color} />
      </g>
      {f.locked && (
        <g transform={`translate(${r * 0.85} ${-r * 0.85})`}>
          <circle r={8} fill="#fffdf9" stroke="#cfc3b3" />
          <path d="M-3.2 -0.5h6.4v4.5h-6.4zM-2 -0.5v-1.8a2 2 0 0 1 4 0v1.8" fill="none" stroke="#5c554c" strokeWidth={1.1} />
        </g>
      )}
      {f.label && (
        <text
          y={r * 1.35 + 16}
          textAnchor="middle"
          fontSize={14}
          fontWeight={550}
          fill="#2f2b26"
          stroke="#faf7f1"
          strokeWidth={4}
          paintOrder="stroke"
          style={{ pointerEvents: 'none' }}
        >
          {f.label}
        </text>
      )}
    </g>
  )
})

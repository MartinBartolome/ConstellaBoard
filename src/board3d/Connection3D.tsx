import { memo, useMemo } from 'react'
import { Html, Line } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import type { BoardEntity, Connection } from '../domain/types'
import { anchorOf } from '../board/geometry'
import { WORLD_SCALE } from './coords'

const LIFT = 0.06

type V2 = { x: number; z: number }

/**
 * Verbindung als Linie auf der Brettoberfläche. Endpunkte werden – wie in
 * 2D – aus den aktuellen Positionen der verbundenen Elemente berechnet.
 */
export const Connection3D = memo(function Connection3D({
  c,
  from,
  to,
  selected,
  onSelect,
}: {
  c: Connection
  from: BoardEntity | undefined
  to: BoardEntity | undefined
  selected: boolean
  onSelect: (e: ThreeEvent<PointerEvent>) => void
}) {
  const a = anchorOf(from)
  const b = anchorOf(to)
  const geo = useMemo(() => {
    if (!a || !b) return null
    const p = { x: a.x * WORLD_SCALE, z: a.y * WORLD_SCALE }
    const q = { x: b.x * WORLD_SCALE, z: b.y * WORLD_SCALE }
    return trim(p, q, (a.r + 6) * WORLD_SCALE, (b.r + 6) * WORLD_SCALE)
  }, [a?.x, a?.y, a?.r, b?.x, b?.y, b?.r]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!geo) return null
  const [p, q] = geo
  const len = Math.hypot(q.x - p.x, q.z - p.z)
  const angle = Math.atan2(q.z - p.z, q.x - p.x)
  const mid: [number, number, number] = [(p.x + q.x) / 2, LIFT, (p.z + q.z) / 2]
  const opacity = c.visible ? 1 : 0.35
  const lw = Math.max(1.5, c.width * 1.4)
  const dash =
    c.style === 'dashed' ? { dashed: true, dashSize: 0.5, gapSize: 0.3 } : c.style === 'dotted' ? { dashed: true, dashSize: 0.08, gapSize: 0.25 } : { dashed: false }

  return (
    <group>
      {/* breite, unsichtbare Trefferfläche */}
      <mesh position={mid} rotation={[0, -angle, 0]} onPointerDown={onSelect}>
        <boxGeometry args={[len, 0.1, 0.9]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {selected && <Line points={[[p.x, LIFT - 0.01, p.z], [q.x, LIFT - 0.01, q.z]]} color="#5b7a5a" lineWidth={lw + 10} transparent opacity={0.25} />}
      {c.style === 'double' ? (
        offsetPairs(p, q, 0.14).map((pts, i) => <Line key={i} points={pts} color={c.color} lineWidth={lw * 0.7} transparent={opacity < 1} opacity={opacity} />)
      ) : (
        <Line
          points={c.style === 'zigzag' ? zigzag(p, q, 0.22) : [[p.x, LIFT, p.z], [q.x, LIFT, q.z]]}
          color={c.color}
          lineWidth={lw}
          transparent={opacity < 1}
          opacity={opacity}
          {...dash}
        />
      )}
      {(c.direction === 'forward' || c.direction === 'both') && <Arrow at={q} angle={angle} color={c.color} opacity={opacity} />}
      {(c.direction === 'backward' || c.direction === 'both') && <Arrow at={p} angle={angle + Math.PI} color={c.color} opacity={opacity} />}
      {c.label && (
        <Html position={[mid[0], 0.5, mid[2]]} center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
          <div className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs whitespace-nowrap text-ink-2 shadow-soft">{c.label}</div>
        </Html>
      )}
    </group>
  )
})

function Arrow({ at, angle, color, opacity }: { at: V2; angle: number; color: string; opacity: number }) {
  // Kegel zeigt entlang +x nach Drehung um z; anschliessend um y in Linienrichtung drehen
  return (
    <group position={[at.x, LIFT + 0.12, at.z]} rotation={[0, -angle, 0]}>
      <mesh position={[-0.2, 0, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
        <coneGeometry args={[0.2, 0.45, 16]} />
        <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} roughness={0.6} />
      </mesh>
    </group>
  )
}

function trim(a: V2, b: V2, ra: number, rb: number): [V2, V2] | null {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const d = Math.hypot(dx, dz)
  if (d <= ra + rb + 0.05) return null
  const ux = dx / d
  const uz = dz / d
  return [
    { x: a.x + ux * ra, z: a.z + uz * ra },
    { x: b.x - ux * rb, z: b.z - uz * rb },
  ]
}

function zigzag(p: V2, q: V2, amp: number): [number, number, number][] {
  const d = Math.hypot(q.x - p.x, q.z - p.z)
  const n = Math.max(2, Math.round(d / 0.45))
  const nx = -(q.z - p.z) / d
  const nz = (q.x - p.x) / d
  const pts: [number, number, number][] = [[p.x, LIFT, p.z]]
  for (let i = 1; i < n; i++) {
    const t = i / n
    const s = i % 2 === 0 ? -amp : amp
    pts.push([p.x + (q.x - p.x) * t + nx * s, LIFT, p.z + (q.z - p.z) * t + nz * s])
  }
  pts.push([q.x, LIFT, q.z])
  return pts
}

function offsetPairs(p: V2, q: V2, off: number): [number, number, number][][] {
  const d = Math.hypot(q.x - p.x, q.z - p.z)
  const nx = (-(q.z - p.z) / d) * off
  const nz = ((q.x - p.x) / d) * off
  return [1, -1].map((s) => [
    [p.x + nx * s, LIFT, p.z + nz * s],
    [q.x + nx * s, LIFT, q.z + nz * s],
  ])
}

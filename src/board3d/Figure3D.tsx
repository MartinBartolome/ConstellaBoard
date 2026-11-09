import { memo, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { RoundedBox } from '@react-three/drei'
import type { FigureTemplate } from '../domain/library'

/**
 * Prozedurale 3D-Figuren im Stil klassischer Holzfiguren eines Systembretts.
 * Alle Modelle stehen auf y = 0, sind um den Ursprung zentriert und blicken
 * nach −z. r ist der Radius in Welt-Einheiten (wie in 2D die Grundgrösse).
 *
 * Später können hier eigene Modelle (glTF aus Blender) eingesetzt werden:
 * Es genügt, für eine Vorlage ein anderes Element zurückzugeben.
 */
export const FigureModel = memo(function FigureModel({
  tpl,
  r,
  color,
  opacity = 1,
}: {
  tpl: FigureTemplate
  r: number
  color: string
  opacity?: number
}) {
  const transparent = opacity < 1
  const mats = useMemo(() => {
    const base = new THREE.Color(color)
    const dark = base.clone().lerp(new THREE.Color('#2f2b26'), 0.35)
    const light = base.clone().lerp(new THREE.Color('#ffffff'), 0.35)
    const mk = (c: THREE.Color, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.62, metalness: 0.02, transparent, opacity, ...extra })
    return { main: mk(base), dark: mk(dark), light: mk(light) }
  }, [color, opacity, transparent])
  useEffect(() => () => Object.values(mats).forEach((x) => x.dispose()), [mats])

  return (
    <group>
      {body(tpl, r, mats)}
      {glyph(tpl, r, mats)}
    </group>
  )
})

type Mats = { main: THREE.Material; dark: THREE.Material; light: THREE.Material }

const cast = { castShadow: true, receiveShadow: true }

/** Kopf mit „Nase" für die Blickrichtung. */
function Head({ r, y, m }: { r: number; y: number; m: Mats }) {
  return (
    <group position={[0, y, 0]}>
      <mesh {...cast} material={m.main}>
        <sphereGeometry args={[r, 24, 16]} />
      </mesh>
      <mesh {...cast} position={[0, -r * 0.05, -r * 0.92]} rotation={[-Math.PI / 2, 0, 0]} material={m.dark}>
        <coneGeometry args={[r * 0.32, r * 0.55, 16]} />
      </mesh>
    </group>
  )
}

/** Pfeilmarke auf dem Sockel: zeigt die Blickrichtung auch von oben. */
function FacingMark({ r, m }: { r: number; m: Mats }) {
  return (
    <mesh position={[0, 0.02, -r * 1.02]} rotation={[-Math.PI / 2, 0, Math.PI]} material={m.dark}>
      <circleGeometry args={[r * 0.22, 3]} />
    </mesh>
  )
}

function Person({ r, shape, m }: { r: number; shape: 'square' | 'circle' | 'hex'; m: Mats }) {
  const h = r * 2.1
  const bodyR = r * 0.72
  return (
    <group>
      {shape === 'square' ? (
        <RoundedBox args={[bodyR * 1.75, h, bodyR * 1.35]} radius={bodyR * 0.28} smoothness={3} position={[0, h / 2, 0]} {...cast} material={m.main} />
      ) : (
        <mesh position={[0, h / 2, 0]} {...cast} material={m.main}>
          <cylinderGeometry args={[bodyR * 0.82, bodyR, h, shape === 'hex' ? 6 : 28]} />
        </mesh>
      )}
      <Head r={r * 0.5} y={h + r * 0.42} m={m} />
      <FacingMark r={r} m={m} />
    </group>
  )
}

function body(tpl: FigureTemplate, r: number, m: Mats) {
  switch (tpl.shape) {
    case 'person-square':
    case 'person-small-square':
      return <Person r={r} shape="square" m={m} />
    case 'person-circle':
    case 'person-small-circle':
      return <Person r={r} shape="circle" m={m} />
    case 'person-hex':
      return <Person r={r} shape="hex" m={m} />
    case 'baby':
      return (
        <group>
          <mesh position={[0, r * 0.75, 0]} scale={[1, 1.15, 1]} {...cast} material={m.main}>
            <sphereGeometry args={[r * 0.7, 24, 16]} />
          </mesh>
          <Head r={r * 0.45} y={r * 1.85} m={m} />
          <FacingMark r={r * 0.8} m={m} />
        </group>
      )
    case 'animal':
      return (
        <group>
          <mesh position={[0, r * 0.75, r * 0.1]} rotation={[Math.PI / 2, 0, 0]} {...cast} material={m.main}>
            <capsuleGeometry args={[r * 0.38, r * 0.8, 8, 16]} />
          </mesh>
          {[
            [-0.25, 0.45],
            [0.25, 0.45],
            [-0.25, -0.25],
            [0.25, -0.25],
          ].map(([x, z], i) => (
            <mesh key={i} position={[x! * r, r * 0.22, z! * r]} {...cast} material={m.dark}>
              <cylinderGeometry args={[r * 0.1, r * 0.1, r * 0.45, 10]} />
            </mesh>
          ))}
          <group position={[0, 0, -r * 0.55]}>
            <Head r={r * 0.3} y={r * 1.05} m={m} />
          </group>
          <FacingMark r={r} m={m} />
        </group>
      )
    case 'family': {
      const n = tpl.glyph === '2' ? 2 : 3
      const pts = n === 2 ? [[-0.42, 0], [0.42, 0]] : [[-0.5, 0.28], [0.5, 0.28], [0, -0.5]]
      return (
        <group>
          <mesh position={[0, r * 0.06, 0]} {...cast} material={m.light}>
            <cylinderGeometry args={[r, r, r * 0.12, 40]} />
          </mesh>
          {pts.map(([x, z], i) => (
            <group key={i} position={[x! * r, r * 0.12, z! * r]}>
              <Person r={r * 0.36} shape="circle" m={m} />
            </group>
          ))}
        </group>
      )
    }
    case 'heart':
      return <Extruded shape={heartShape(r)} depth={r * 0.45} lift={r * 0.85} m={m.main} />
    case 'star':
      return <Extruded shape={starShape(r)} depth={r * 0.4} lift={r} m={m.main} />
    case 'sun':
      return (
        <group position={[0, r * 0.9, 0]}>
          <mesh {...cast} material={m.main}>
            <sphereGeometry args={[r * 0.55, 28, 18]} />
          </mesh>
          {Array.from({ length: 10 }, (_, i) => {
            const a = (i / 10) * Math.PI * 2
            return (
              <mesh key={i} position={[Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78, 0]} rotation={[0, 0, a - Math.PI / 2]} {...cast} material={m.light}>
                <coneGeometry args={[r * 0.12, r * 0.32, 10]} />
              </mesh>
            )
          })}
        </group>
      )
    case 'tree':
      return (
        <group>
          <mesh position={[0, r * 0.5, 0]} {...cast} material={m.dark}>
            <cylinderGeometry args={[r * 0.14, r * 0.2, r, 12]} />
          </mesh>
          <mesh position={[0, r * 1.35, 0]} {...cast} material={m.main}>
            <coneGeometry args={[r * 0.75, r * 1.2, 18]} />
          </mesh>
          <mesh position={[0, r * 1.9, 0]} {...cast} material={m.main}>
            <coneGeometry args={[r * 0.55, r * 0.9, 18]} />
          </mesh>
        </group>
      )
    case 'house':
      return (
        <group>
          <mesh position={[0, r * 0.5, 0]} {...cast} material={m.main}>
            <boxGeometry args={[r * 1.3, r, r * 1.1]} />
          </mesh>
          <mesh position={[0, r * 1.3, 0]} rotation={[0, Math.PI / 4, 0]} {...cast} material={m.dark}>
            <coneGeometry args={[r * 1.05, r * 0.65, 4]} />
          </mesh>
          <mesh position={[0, r * 0.32, -r * 0.56]} material={m.dark}>
            <boxGeometry args={[r * 0.32, r * 0.6, 0.02]} />
          </mesh>
        </group>
      )
    case 'stone':
      return (
        <mesh position={[0, r * 0.42, 0]} scale={[1.1, 0.62, 0.9]} {...cast} material={m.main}>
          <dodecahedronGeometry args={[r * 0.75, 1]} />
        </mesh>
      )
    case 'flame':
      return (
        <group>
          <mesh position={[0, r * 0.45, 0]} {...cast} material={m.main}>
            <sphereGeometry args={[r * 0.48, 24, 16]} />
          </mesh>
          <mesh position={[0, r * 1.15, 0]} {...cast} material={m.main}>
            <coneGeometry args={[r * 0.46, r * 1.1, 24]} />
          </mesh>
          <mesh position={[0, r * 0.75, -r * 0.2]} material={m.light}>
            <coneGeometry args={[r * 0.2, r * 0.6, 16]} />
          </mesh>
        </group>
      )
    case 'question':
      return (
        <group position={[0, 0, 0]}>
          <mesh position={[0, r * 1.45, 0]} rotation={[0, 0, -Math.PI / 2]} {...cast} material={m.main}>
            <torusGeometry args={[r * 0.38, r * 0.12, 12, 28, Math.PI * 1.4]} />
          </mesh>
          <mesh position={[0, r * 0.85, 0]} {...cast} material={m.main}>
            <cylinderGeometry args={[r * 0.12, r * 0.12, r * 0.4, 12]} />
          </mesh>
          <mesh position={[0, r * 0.3, 0]} {...cast} material={m.main}>
            <sphereGeometry args={[r * 0.15, 16, 12]} />
          </mesh>
        </group>
      )
    case 'flag':
      return (
        <group>
          <mesh position={[0, r * 0.06, 0]} {...cast} material={m.dark}>
            <cylinderGeometry args={[r * 0.35, r * 0.4, r * 0.12, 20]} />
          </mesh>
          <mesh position={[0, r * 1.1, 0]} {...cast} material={m.dark}>
            <cylinderGeometry args={[r * 0.05, r * 0.05, r * 2.2, 10]} />
          </mesh>
          <mesh position={[r * 0.48, r * 1.8, 0]} {...cast} material={m.main}>
            <boxGeometry args={[r * 0.9, r * 0.55, r * 0.05]} />
          </mesh>
        </group>
      )
    case 'eye':
      return (
        <group position={[0, r * 0.75, 0]}>
          <mesh scale={[1, 0.75, 1]} {...cast} material={m.light}>
            <sphereGeometry args={[r * 0.7, 28, 18]} />
          </mesh>
          <mesh position={[0, 0, -r * 0.55]} material={m.main}>
            <sphereGeometry args={[r * 0.28, 20, 14]} />
          </mesh>
          <mesh position={[0, 0, -r * 0.74]} material={m.dark}>
            <sphereGeometry args={[r * 0.12, 16, 12]} />
          </mesh>
        </group>
      )
    case 'triangle':
      // Pyramide, eine Spitze zeigt in Blickrichtung
      return (
        <mesh position={[0, r * 0.55, 0]} rotation={[0, Math.PI, 0]} {...cast} material={m.main}>
          <coneGeometry args={[r * 0.95, r * 1.1, 3]} />
        </mesh>
      )
    case 'diamond':
      return (
        <mesh position={[0, r * 0.9, 0]} scale={[0.8, 1.1, 0.8]} {...cast} material={m.main}>
          <octahedronGeometry args={[r * 0.8]} />
        </mesh>
      )
    case 'ring':
      return (
        <mesh position={[0, r * 0.85, 0]} {...cast} material={m.main}>
          <torusGeometry args={[r * 0.65, r * 0.18, 16, 40]} />
        </mesh>
      )
    case 'cloud':
      return (
        <group position={[0, r * 0.7, 0]}>
          {[
            [0, 0.1, 0, 0.55],
            [-0.5, -0.05, 0.1, 0.4],
            [0.5, -0.05, -0.05, 0.42],
            [0.15, 0.35, 0.15, 0.35],
            [-0.2, 0.25, -0.2, 0.36],
          ].map(([x, y, z, s], i) => (
            <mesh key={i} position={[x! * r, y! * r, z! * r]} {...cast} material={m.main}>
              <sphereGeometry args={[s! * r, 20, 14]} />
            </mesh>
          ))}
        </group>
      )
    case 'block':
      return <RoundedBox args={[r * 1.6, r * 0.9, r * 1.2]} radius={r * 0.08} smoothness={2} position={[0, r * 0.45, 0]} {...cast} material={m.main} />
    case 'wave':
      return <Wave r={r} m={m.main} />
  }
}

function glyph(tpl: FigureTemplate, r: number, m: Mats) {
  const isPerson = tpl.shape.startsWith('person') || tpl.shape === 'baby'
  if (!isPerson) return null
  const top = tpl.shape === 'baby' ? r * 2.35 : r * 2.1 + r * 0.95
  if (tpl.glyph === 'ring')
    return (
      <mesh position={[0, top - r * 0.6, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.light}>
        <torusGeometry args={[r * 0.48, r * 0.06, 10, 32]} />
      </mesh>
    )
  if (tpl.glyph === 'dot')
    return (
      <mesh position={[0, top + r * 0.12, 0]} material={m.light} castShadow>
        <sphereGeometry args={[r * 0.18, 16, 12]} />
      </mesh>
    )
  return null
}

function Extruded({ shape, depth, lift, m }: { shape: THREE.Shape; depth: number; lift: number; m: THREE.Material }) {
  const geo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: depth * 0.18, bevelThickness: depth * 0.18, bevelSegments: 3, curveSegments: 20 })
    g.center()
    return g
  }, [shape, depth])
  return <mesh geometry={geo} position={[0, lift, 0]} {...cast} material={m} />
}

function Wave({ r, m }: { r: number; m: THREE.Material }) {
  const geo = useMemo(() => {
    const pts = Array.from({ length: 24 }, (_, i) => {
      const t = i / 23
      return new THREE.Vector3((t - 0.5) * r * 2, r * 0.6 + Math.sin(t * Math.PI * 3) * r * 0.35, 0)
    })
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, r * 0.14, 10, false)
  }, [r])
  return <mesh geometry={geo} {...cast} material={m} />
}

function heartShape(r: number): THREE.Shape {
  const s = new THREE.Shape()
  // Gleiche Kurve wie in 2D, y nach oben gespiegelt
  s.moveTo(0, -r * 0.85)
  s.bezierCurveTo(-r * 1.4, r * 0.1, -r * 0.7, r * 1.1, 0, r * 0.45)
  s.bezierCurveTo(r * 0.7, r * 1.1, r * 1.4, r * 0.1, 0, -r * 0.85)
  return s
}

function starShape(r: number): THREE.Shape {
  const s = new THREE.Shape()
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2
    const x = Math.cos(a) * rr
    const y = Math.sin(a) * rr
    if (i === 0) s.moveTo(x, y)
    else s.lineTo(x, y)
  }
  s.closePath()
  return s
}

/** Höhe der Figur (für Beschriftung und Auswahlring). */
export function figureHeight(tpl: FigureTemplate, r: number): number {
  if (tpl.shape.startsWith('person')) return r * 3.2
  if (tpl.shape === 'baby') return r * 2.4
  if (tpl.shape === 'tree' || tpl.shape === 'flag') return r * 2.4
  if (tpl.shape === 'question') return r * 2
  return r * 1.8
}

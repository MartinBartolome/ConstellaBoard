import { memo, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { RoundedBox } from '@react-three/drei'
import type { FigureTemplate } from '../domain/library'
import { arc, personCross, personProfile, revolve, smooth, softHex, superellipse, type PersonKind } from './geometry3d'
import { useFigureWood, type WoodMaps } from './textures'

/**
 * 3D-Figuren im Stil gedrechselter, lackierter Holzfiguren eines Systembretts.
 * Alle Modelle stehen auf y = 0, sind um den Ursprung zentriert und blicken
 * nach −z. r ist der Radius in Welt-Einheiten (wie in 2D die Grundgrösse).
 *
 * Material: physikalisch basiert (PBR) mit echter Holzmaserung (Ahorn,
 * Poly Haven CC0), eingefärbt mit der Figurenfarbe, plus Normal- und
 * Rauheitskarte. Geometrien werden pro Form und Grösse geteilt.
 */
export const FigureModel = memo(function FigureModel({ tpl, r, color, opacity = 1 }: { tpl: FigureTemplate; r: number; color: string; opacity?: number }) {
  const wood = useFigureWood()
  const mats = useFigureMaterials(color, opacity, wood)
  return (
    <group>
      {body(tpl, r, mats)}
      {glyph(tpl, r, mats)}
    </group>
  )
})

export interface Mats {
  main: THREE.MeshStandardMaterial
  dark: THREE.MeshStandardMaterial
  light: THREE.MeshStandardMaterial
  /** natürliches, unbemaltes Holz (Stämme, Stäbe) */
  natural: THREE.MeshStandardMaterial
  /** Stein: ohne Maserung, matt */
  stone: THREE.MeshStandardMaterial
}

export function useFigureMaterials(color: string, opacity: number, wood: WoodMaps): Mats {
  const transparent = opacity < 1
  const mats = useMemo(() => {
    const base = new THREE.Color(color)
    const dark = base.clone().lerp(new THREE.Color('#2a2420'), 0.45)
    const light = base.clone().lerp(new THREE.Color('#fffaf0'), 0.45)
    const mk = (c: THREE.Color | string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
      new THREE.MeshStandardMaterial({
        color: c,
        roughness: 0.75,
        metalness: 0,
        envMapIntensity: 0.9,
        transparent,
        opacity,
        depthWrite: !transparent,
        ...extra,
      })
    return {
      main: mk(base),
      dark: mk(dark, { roughness: 0.8 }),
      light: mk(light, { roughness: 0.7 }),
      natural: mk('#c8a477', { roughness: 0.85 }),
      stone: mk(base, { roughness: 0.85 }),
    }
  }, [color, opacity, transparent])

  // Texturen nachreichen, sobald geladen
  useEffect(() => {
    for (const [k, m] of Object.entries(mats)) {
      if (k === 'stone') {
        m.normalMap = wood.normalMap
        m.normalScale.set(1.6, 1.6)
      } else {
        m.map = wood.map
        m.normalMap = wood.normalMap
        m.normalScale.set(0.55, 0.55)
        m.roughnessMap = wood.roughnessMap
      }
      m.needsUpdate = true
    }
  }, [mats, wood.map, wood.normalMap, wood.roughnessMap])

  useEffect(() => () => Object.values(mats).forEach((x) => x.dispose()), [mats])
  return mats
}

const cast = { castShadow: true, receiveShadow: true }

// ---------------------------------------------------------------------------
// Geteilte Geometrien (pro Form und gerundeter Grösse)

const geoCache = new Map<string, THREE.BufferGeometry>()
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key)
  if (!g) {
    g = make()
    geoCache.set(key, g)
  }
  return g
}
const rk = (r: number) => Math.round(r * 100)

function personGeo(kind: PersonKind, child: boolean, r: number) {
  const { profile, dims } = personProfile(kind, child)
  const geo = cached(`person:${kind}:${child}:${rk(r)}`, () => {
    const g = revolve(profile, 56, personCross(kind, dims.neck))
    g.scale(r, r, r)
    return g
  })
  return { geo, dims }
}

/** Gedrechselte Person mit Sockel, Kopf und geschnitzter Nase in Blickrichtung. */
function Person({ r, kind, child = false, m }: { r: number; kind: PersonKind; child?: boolean; m: Mats }) {
  const { geo, dims } = personGeo(kind, child, r)
  const hr = dims.headR * r
  return (
    <group>
      <mesh geometry={geo} material={m.main} {...cast} />
      <Nose r={hr} y={dims.headY * r} m={m} />
      <FacingMark r={r} m={m} />
    </group>
  )
}

/** Nase: zeigt die Blickrichtung, wie bei klassischen Aufstellungsfiguren. */
function Nose({ r, y, m }: { r: number; y: number; m: Mats }) {
  return (
    <mesh position={[0, y - r * 0.08, -r * 0.9]} scale={[0.7, 0.85, 1.25]} material={m.dark} castShadow>
      <sphereGeometry args={[r * 0.22, 16, 12]} />
    </mesh>
  )
}

/** Eingelassene Pfeilmarke auf dem Sockel: zeigt die Blickrichtung auch von oben. */
function FacingMark({ r, m }: { r: number; m: Mats }) {
  return (
    <mesh position={[0, r * 0.171, -r * 0.8]} rotation={[-Math.PI / 2, 0, Math.PI]} material={m.dark}>
      <circleGeometry args={[r * 0.13, 3]} />
    </mesh>
  )
}

function body(tpl: FigureTemplate, r: number, m: Mats) {
  switch (tpl.shape) {
    case 'person-square':
      return <Person r={r} kind="square" m={m} />
    case 'person-small-square':
      return <Person r={r} kind="square" child m={m} />
    case 'person-circle':
      return <Person r={r} kind="circle" m={m} />
    case 'person-small-circle':
      return <Person r={r} kind="circle" child m={m} />
    case 'person-hex':
      return <Person r={r} kind="hex" m={m} />
    case 'baby':
      return <Baby r={r} m={m} />
    case 'animal':
      return <Animal r={r} m={m} />
    case 'family': {
      const n = tpl.glyph === '2' ? 2 : 3
      const pts =
        n === 2
          ? [
              [-0.42, 0],
              [0.42, 0],
            ]
          : [
              [-0.48, 0.26],
              [0.48, 0.26],
              [0, -0.46],
            ]
      const kinds: PersonKind[] = n === 2 ? ['square', 'circle'] : ['square', 'circle', 'hex']
      return (
        <group>
          <Turned
            r={r}
            k="family-base"
            m={m.light}
            profile={[
              [0, 0],
              [0.96, 0],
              [1, 0.03],
              [1, 0.1],
              [0.96, 0.13],
              [0, 0.13],
            ]}
          />
          {pts.map(([x, z], i) => (
            <group key={i} position={[x! * r, r * 0.13, z! * r]}>
              <Person r={r * (i === 2 ? 0.28 : 0.34)} kind={kinds[i]!} child={i === 2} m={m} />
            </group>
          ))}
        </group>
      )
    }
    case 'heart':
      return <Extruded shape={heartShape(r)} depth={r * 0.45} lift={r * 0.95} m={m.main} k={`heart:${rk(r)}`} />
    case 'star':
      return <Extruded shape={starShape(r)} depth={r * 0.4} lift={r * 1.05} m={m.main} k={`star:${rk(r)}`} />
    case 'sun':
      return (
        <group>
          <Stand r={r} m={m} height={r * 0.55} />
          <group position={[0, r * 1.15, 0]}>
            <mesh {...cast} material={m.main}>
              <sphereGeometry args={[r * 0.52, 32, 20]} />
            </mesh>
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i / 12) * Math.PI * 2
              return (
                <mesh key={i} position={[Math.cos(a) * r * 0.74, Math.sin(a) * r * 0.74, 0]} rotation={[0, 0, a - Math.PI / 2]} {...cast} material={m.light}>
                  <coneGeometry args={[r * 0.11, r * 0.34, 14]} />
                </mesh>
              )
            })}
          </group>
        </group>
      )
    case 'tree':
      return (
        <group>
          <Turned
            r={r}
            k="tree-trunk"
            m={m.natural}
            profile={[
              [0, 0],
              [0.42, 0],
              [0.45, 0.04],
              [0.42, 0.1],
              [0.2, 0.14],
              [0.15, 0.3],
              [0.14, 0.75],
              [0, 0.78],
            ]}
          />
          <Turned
            r={r}
            k="tree-crown"
            m={m.main}
            segments={40}
            profile={smooth(
              [
                [0, 0.6],
                [0.55, 0.66],
                [0.82, 0.95],
                [0.72, 1.3],
                [0.78, 1.45],
                [0.6, 1.8],
                [0.62, 1.92],
                [0.35, 2.25],
                [0, 2.42],
              ],
              5,
            )}
          />
        </group>
      )
    case 'house':
      return <House r={r} m={m} />
    case 'stone':
      return <Stone r={r} m={m} />
    case 'flame':
      return (
        <group>
          <Turned
            r={r}
            k="flame"
            m={m.main}
            profile={smooth(
              [
                [0, 0],
                [0.32, 0.03],
                [0.5, 0.25],
                [0.52, 0.55],
                [0.4, 0.95],
                [0.22, 1.35],
                [0.08, 1.65],
                [0, 1.85],
              ],
              6,
            )}
          />
          <mesh position={[0, r * 0.62, -r * 0.3]} scale={[0.7, 1.25, 0.7]} material={m.light}>
            <sphereGeometry args={[r * 0.22, 18, 14]} />
          </mesh>
        </group>
      )
    case 'question':
      return (
        <group>
          <Stand r={r * 0.8} m={m} height={0} />
          <mesh position={[0, r * 1.5, 0]} rotation={[0, 0, -Math.PI / 2]} {...cast} material={m.main}>
            <torusGeometry args={[r * 0.38, r * 0.13, 18, 36, Math.PI * 1.4]} />
          </mesh>
          <mesh position={[0, r * 0.95, 0]} {...cast} material={m.main}>
            <capsuleGeometry args={[r * 0.13, r * 0.3, 8, 16]} />
          </mesh>
          <mesh position={[0, r * 0.42, 0]} {...cast} material={m.main}>
            <sphereGeometry args={[r * 0.16, 20, 14]} />
          </mesh>
        </group>
      )
    case 'flag':
      return (
        <group>
          <Turned
            r={r}
            k="flag-base"
            m={m.natural}
            profile={[
              [0, 0],
              [0.42, 0],
              [0.45, 0.04],
              [0.45, 0.1],
              [0.38, 0.15],
              [0.07, 0.17],
              [0.06, 2.3],
              [0.09, 2.34],
              [0.06, 2.4],
              [0, 2.42],
            ]}
          />
          <Cloth r={r} m={m.main} />
        </group>
      )
    case 'eye':
      return (
        <group>
          <Stand r={r * 0.8} m={m} height={r * 0.3} />
          <group position={[0, r * 0.95, 0]}>
            <mesh scale={[1, 0.72, 0.9]} {...cast} material={m.light}>
              <sphereGeometry args={[r * 0.66, 32, 22]} />
            </mesh>
            <mesh position={[0, 0, -r * 0.5]} scale={[1, 1, 0.5]} material={m.main}>
              <sphereGeometry args={[r * 0.3, 24, 16]} />
            </mesh>
            <mesh position={[0, 0, -r * 0.62]} scale={[1, 1, 0.5]} material={m.dark}>
              <sphereGeometry args={[r * 0.14, 18, 12]} />
            </mesh>
          </group>
        </group>
      )
    case 'triangle':
      // Pyramide, eine Spitze zeigt in Blickrichtung
      return (
        <Turned
          r={r}
          k="pyramid"
          m={m.main}
          segments={3}
          rotate={Math.PI / 2}
          profile={[
            [0, 0],
            [0.95, 0],
            [0.97, 0.04],
            [0.06, 1.12],
            [0, 1.14],
          ]}
        />
      )
    case 'diamond':
      return (
        <Turned
          r={r}
          k="diamond"
          m={m.main}
          segments={4}
          rotate={0}
          profile={[
            [0, 0.05],
            [0.66, 0.95],
            [0.66, 1.0],
            [0, 1.9],
          ]}
        />
      )
    case 'ring':
      return (
        <group>
          <Stand r={r * 0.6} m={m} height={0} />
          <mesh position={[0, r * 0.88, 0]} {...cast} material={m.main}>
            <torusGeometry args={[r * 0.66, r * 0.19, 24, 56]} />
          </mesh>
        </group>
      )
    case 'cloud':
      return (
        <group position={[0, r * 0.72, 0]}>
          {[
            [0, 0.1, 0, 0.55],
            [-0.52, -0.06, 0.08, 0.4],
            [0.52, -0.06, -0.05, 0.42],
            [0.18, 0.36, 0.14, 0.36],
            [-0.22, 0.28, -0.2, 0.37],
            [0.05, -0.12, 0.3, 0.38],
          ].map(([x, y, z, s], i) => (
            <mesh key={i} position={[x! * r, y! * r, z! * r]} {...cast} material={m.main}>
              <sphereGeometry args={[s! * r, 28, 18]} />
            </mesh>
          ))}
        </group>
      )
    case 'block':
      return <RoundedBox args={[r * 1.6, r * 0.9, r * 1.2]} radius={r * 0.12} smoothness={4} position={[0, r * 0.45, 0]} {...cast} material={m.main} />
    case 'wave':
      return <Wave r={r} m={m.main} />
  }
}

function glyph(tpl: FigureTemplate, r: number, m: Mats) {
  const isPerson = tpl.shape.startsWith('person')
  if (!isPerson) return null
  const kind: PersonKind = tpl.shape.includes('square') ? 'square' : tpl.shape.includes('hex') ? 'hex' : 'circle'
  const { dims } = personProfile(kind, tpl.shape.includes('small'))
  if (tpl.glyph === 'ring')
    // Älterer Mensch: Kragen aus hellem Holz
    return (
      <mesh position={[0, dims.neck * r - r * 0.02, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.light} castShadow>
        <torusGeometry args={[r * 0.33, r * 0.075, 12, 40]} />
      </mesh>
    )
  if (tpl.glyph === 'dot')
    // Haarknoten
    return (
      <mesh position={[0, (dims.top - 0.05) * r, r * 0.18]} material={m.dark} castShadow>
        <sphereGeometry args={[r * 0.2, 20, 14]} />
      </mesh>
    )
  return null
}

function Turned({
  r,
  k,
  m,
  profile,
  segments = 48,
  rotate = 0,
}: {
  r: number
  k: string
  m: THREE.Material
  profile: ReadonlyArray<readonly [number, number]>
  segments?: number
  rotate?: number
}) {
  const geo = cached(`${k}:${segments}:${rk(r)}`, () => {
    const g = revolve(profile, segments)
    g.scale(r, r, r)
    if (rotate) g.rotateY(rotate)
    if (segments < 8) {
      // Kanten (Pyramide, Raute) bewusst hart lassen
      const ng = g.toNonIndexed()
      ng.computeVertexNormals()
      return ng
    }
    return g
  })
  return <mesh geometry={geo} material={m} {...cast} />
}

/** Kleiner gedrechselter Fuss für Symbole, die sonst schweben würden. */
function Stand({ r, m, height }: { r: number; m: Mats; height: number }) {
  const h = height / r
  return (
    <Turned
      r={r}
      k={`stand:${Math.round(h * 100)}`}
      m={m.natural}
      profile={[
        [0, 0],
        [0.42, 0],
        [0.45, 0.04],
        [0.42, 0.1],
        [0.12, 0.13],
        [0.1, 0.13 + h + 0.25],
        [0, 0.13 + h + 0.25],
      ]}
    />
  )
}

function Baby({ r, m }: { r: number; m: Mats }) {
  const profile = useMemo(
    () =>
      [
        [0, 0],
        [0.72, 0],
        [0.78, 0.05],
        [0.78, 0.1],
        [0.7, 0.14],
        ...smooth(
          [
            [0.62, 0.16],
            [0.7, 0.45],
            [0.66, 0.85],
            [0.48, 1.12],
            [0.24, 1.22],
          ],
          4,
        ),
        [0.2, 1.26],
        ...arc(0, 1.62, 0.42, -60, 90, 14),
      ] as [number, number][],
    [],
  )
  const geo = cached(`baby:${rk(r)}`, () => {
    const g = revolve(profile, 48)
    g.scale(r, r, r)
    return g
  })
  return (
    <group>
      <mesh geometry={geo} material={m.main} {...cast} />
      <Nose r={r * 0.42} y={r * 1.62} m={m} />
    </group>
  )
}

/** Tier: gedrechselter Hund im Holzspielzeug-Stil. */
function Animal({ r, m }: { r: number; m: Mats }) {
  return (
    <group>
      {/* Rumpf */}
      <mesh position={[0, r * 0.78, r * 0.08]} rotation={[Math.PI / 2, 0, 0]} {...cast} material={m.main}>
        <capsuleGeometry args={[r * 0.34, r * 0.72, 10, 24]} />
      </mesh>
      {/* Beine */}
      {[
        [-0.22, 0.48],
        [0.22, 0.48],
        [-0.22, -0.28],
        [0.22, -0.28],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x! * r, r * 0.3, z! * r]} {...cast} material={m.main}>
          <capsuleGeometry args={[r * 0.1, r * 0.42, 6, 14]} />
        </mesh>
      ))}
      {/* Hals und Kopf */}
      <mesh position={[0, r * 1.05, -r * 0.42]} rotation={[-0.6, 0, 0]} {...cast} material={m.main}>
        <capsuleGeometry args={[r * 0.17, r * 0.28, 8, 16]} />
      </mesh>
      <group position={[0, r * 1.32, -r * 0.6]}>
        <mesh {...cast} material={m.main}>
          <sphereGeometry args={[r * 0.27, 28, 18]} />
        </mesh>
        <mesh position={[0, -r * 0.06, -r * 0.24]} rotation={[Math.PI / 2, 0, 0]} {...cast} material={m.main}>
          <capsuleGeometry args={[r * 0.13, r * 0.14, 8, 16]} />
        </mesh>
        <mesh position={[0, -r * 0.03, -r * 0.42]} material={m.dark}>
          <sphereGeometry args={[r * 0.06, 12, 10]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * r * 0.2, r * 0.1, r * 0.04]} rotation={[0.2, 0, s * 0.35]} scale={[0.45, 1, 0.8]} {...cast} material={m.dark}>
            <sphereGeometry args={[r * 0.17, 16, 12]} />
          </mesh>
        ))}
      </group>
      {/* Schwanz */}
      <mesh position={[0, r * 1.02, r * 0.66]} rotation={[0.7, 0, 0]} {...cast} material={m.main}>
        <capsuleGeometry args={[r * 0.06, r * 0.32, 6, 12]} />
      </mesh>
    </group>
  )
}

function House({ r, m }: { r: number; m: Mats }) {
  const w = r * 0.62 // halbe Breite
  const eave = r * 0.95
  const ridge = r * 1.5
  const d = r * 1.05 // Tiefe (entlang z, Giebel vorne in Blickrichtung)
  const body = cached(`house:${rk(r)}`, () => {
    const s = new THREE.Shape()
    s.moveTo(-w, 0)
    s.lineTo(w, 0)
    s.lineTo(w, eave)
    s.lineTo(0, ridge)
    s.lineTo(-w, eave)
    s.closePath()
    const b = r * 0.04
    const g = new THREE.ExtrudeGeometry(s, { depth: d - b * 2, bevelEnabled: true, bevelSize: b, bevelThickness: b, bevelSegments: 3, curveSegments: 4 })
    g.translate(0, b, -(d - b * 2) / 2)
    return g
  })
  const slopeLen = Math.hypot(w, ridge - eave)
  const angle = Math.atan2(ridge - eave, w)
  const t = r * 0.09
  const roof = cached(`roof:${rk(r)}`, () => new THREE.BoxGeometry(slopeLen + r * 0.16, t, d + r * 0.2))
  return (
    <group>
      <mesh geometry={body} material={m.main} {...cast} />
      {[-1, 1].map((s) => {
        // Mitte der Dachschräge, um die halbe Dachdicke nach aussen versetzt
        const mx = (s * w) / 2 + s * Math.sin(angle) * (t / 2 + r * 0.02)
        const my = (eave + ridge) / 2 + Math.cos(angle) * (t / 2 + r * 0.02)
        return <mesh key={s} geometry={roof} material={m.dark} position={[mx, my, 0]} rotation={[0, 0, -s * angle]} {...cast} />
      })}
      {/* Tür und Fenster im Giebel (Blickrichtung) */}
      <mesh position={[0, r * 0.33, -d / 2 - r * 0.01]} material={m.dark}>
        <boxGeometry args={[r * 0.3, r * 0.58, r * 0.04]} />
      </mesh>
      <mesh position={[0, r * 1.08, -d / 2 - r * 0.01]} rotation={[0, Math.PI, 0]} material={m.light}>
        <circleGeometry args={[r * 0.12, 24]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (w + r * 0.01), r * 0.55, 0]} rotation={[0, (s * Math.PI) / 2, 0]} material={m.light}>
          <planeGeometry args={[r * 0.3, r * 0.3]} />
        </mesh>
      ))}
    </group>
  )
}

function Stone({ r, m }: { r: number; m: Mats }) {
  const geo = cached(`stone:${rk(r)}`, () => {
    const g = new THREE.IcosahedronGeometry(r * 0.72, 5)
    const p = g.getAttribute('position') as THREE.BufferAttribute
    const v = new THREE.Vector3()
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i)
      const n = v.clone().normalize()
      // sanfte, deterministische Unregelmässigkeit wie bei einem Flusskiesel
      const d = 1 + 0.07 * Math.sin(n.x * 3.1 + n.y * 1.7) + 0.05 * Math.sin(n.z * 4.3 - n.x * 2.2) + 0.03 * Math.sin(n.y * 7.1 + n.z * 5.3)
      v.multiplyScalar(d)
      p.setXYZ(i, v.x * 1.12, v.y * 0.6, v.z * 0.92)
    }
    g.computeVertexNormals()
    g.translate(0, r * 0.4, 0)
    return g
  })
  return <mesh geometry={geo} material={m.stone} {...cast} />
}

function Cloth({ r, m }: { r: number; m: THREE.Material }) {
  const geo = cached(`cloth:${rk(r)}`, () => {
    const g = new THREE.BoxGeometry(r * 0.95, r * 0.6, r * 0.05, 16, 6, 1)
    const p = g.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) / r + 0.475
      p.setZ(i, p.getZ(i) + Math.sin(x * 6) * r * 0.06 * x)
    }
    g.computeVertexNormals()
    g.translate(r * 0.53, r * 2.05, 0)
    return g
  })
  return <mesh geometry={geo} material={m} {...cast} />
}

function Extruded({ shape, depth, lift, m, k }: { shape: THREE.Shape; depth: number; lift: number; m: THREE.Material; k: string }) {
  const geo = cached(k, () => {
    const g = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelSize: depth * 0.22,
      bevelThickness: depth * 0.28,
      bevelSegments: 5,
      curveSegments: 28,
    })
    g.center()
    return g
  })
  return <mesh geometry={geo} position={[0, lift, 0]} {...cast} material={m} />
}

function Wave({ r, m }: { r: number; m: THREE.Material }) {
  const geo = cached(`wave:${rk(r)}`, () => {
    const pts = Array.from({ length: 24 }, (_, i) => {
      const t = i / 23
      return new THREE.Vector3((t - 0.5) * r * 2, r * 0.6 + Math.sin(t * Math.PI * 3) * r * 0.35, 0)
    })
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, r * 0.14, 14, false)
  })
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

/** Höhe der Figur (für Beschriftung, Sprechblase und Auswahlring). */
export function figureHeight(tpl: FigureTemplate, r: number): number {
  if (tpl.shape.startsWith('person')) {
    const kind: PersonKind = tpl.shape.includes('square') ? 'square' : tpl.shape.includes('hex') ? 'hex' : 'circle'
    return personProfile(kind, tpl.shape.includes('small')).dims.top * r
  }
  switch (tpl.shape) {
    case 'baby':
      return r * 2.05
    case 'tree':
    case 'flag':
      return r * 2.42
    case 'question':
      return r * 2.05
    case 'sun':
      return r * 2.05
    case 'flame':
      return r * 1.85
    case 'diamond':
      return r * 1.9
    case 'family':
      return r * 1.3
    case 'house':
      return r * 1.6
    default:
      return r * 1.8
  }
}

// Für Tests: Querschnitte bleiben stabil
export const __test = { superellipse, softHex }

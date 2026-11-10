import * as THREE from 'three'

/**
 * Gedrechselte Figuren: Ein Profil (Radius, Höhe) wird um die Hochachse
 * gedreht. Der Querschnitt kann pro Höhe von rund zu eckig (Superellipse)
 * oder sechseckig wechseln – so entstehen die klassischen Formen eines
 * Systembretts (Mann eckig, Frau rund, neutral sechseckig) mit weichen,
 * polierten Kanten wie bei echten Holzfiguren.
 *
 * UV-Koordinaten sind in Welt-Einheiten (u entlang des Umfangs, v entlang des
 * Profils), damit die Holzmaserung auf allen Figuren gleich gross wirkt.
 */

export type Profile = ReadonlyArray<readonly [number, number]>
/** Querschnittsfaktor für Winkel theta auf Höhe y (1 = Kreis) */
export type CrossSection = (theta: number, y: number) => number

export const ROUND: CrossSection = () => 1

/** Abgerundetes Quadrat (Superellipse) mit Exponent n, normiert auf gleiche Fläche wie der Kreis. */
export function superellipse(n: number): (theta: number) => number {
  const norm = n <= 2 ? 1 : 0.9
  return (t) => norm * Math.pow(Math.pow(Math.abs(Math.cos(t)), n) + Math.pow(Math.abs(Math.sin(t)), n), -1 / n)
}

/** Weich gerundetes Sechseck. */
export function softHex(theta: number): number {
  const seg = Math.PI / 3
  const a = ((((theta + Math.PI / 6) % seg) + seg) % seg) - seg / 2
  const hex = Math.cos(Math.PI / 6) / Math.cos(a)
  return 0.97 * (0.35 + 0.65 * hex)
}

/** Übergang zwischen zwei Querschnitten zwischen den Höhen y0 und y1. */
export function blendCross(lower: (t: number) => number, upper: (t: number) => number, y0: number, y1: number): CrossSection {
  return (t, y) => {
    if (y <= y0) return lower(t)
    if (y >= y1) return upper(t)
    const k = (y - y0) / (y1 - y0)
    const s = k * k * (3 - 2 * k)
    return lower(t) * (1 - s) + upper(t) * s
  }
}

export function revolve(profile: Profile, segments = 48, cross: CrossSection = ROUND): THREE.BufferGeometry {
  const rows = profile.length
  const cols = segments + 1
  const pos = new Float32Array(rows * cols * 3)
  const uv = new Float32Array(rows * cols * 2)
  let arc = 0
  let maxR = 0
  for (const [r] of profile) maxR = Math.max(maxR, r)
  for (let i = 0; i < rows; i++) {
    const [r, y] = profile[i]!
    if (i > 0) {
      const [pr, py] = profile[i - 1]!
      arc += Math.hypot(r - pr, y - py)
    }
    for (let j = 0; j < cols; j++) {
      const t = (j / segments) * Math.PI * 2
      const f = cross(t, y)
      const k = (i * cols + j) * 3
      // Vorderseite (Blickrichtung −z) liegt bei t = −π/2
      pos[k] = Math.cos(t) * r * f
      pos[k + 1] = y
      pos[k + 2] = Math.sin(t) * r * f
      const q = (i * cols + j) * 2
      uv[q] = (j / segments) * Math.PI * 2 * maxR * 0.6
      uv[q + 1] = arc
    }
  }
  const index: number[] = []
  for (let i = 0; i < rows - 1; i++)
    for (let j = 0; j < segments; j++) {
      const a = i * cols + j
      const b = a + cols
      index.push(a, b, a + 1, b, b + 1, a + 1)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setIndex(index)
  g.computeVertexNormals()
  // Naht schliessen: Normalen der ersten und letzten Spalte mitteln
  const n = g.getAttribute('normal') as THREE.BufferAttribute
  const v = new THREE.Vector3()
  const w = new THREE.Vector3()
  for (let i = 0; i < rows; i++) {
    const a = i * cols
    const b = a + segments
    v.fromBufferAttribute(n, a)
    w.fromBufferAttribute(n, b)
    v.add(w).normalize()
    n.setXYZ(a, v.x, v.y, v.z)
    n.setXYZ(b, v.x, v.y, v.z)
  }
  // Pole: Normale senkrecht
  for (const i of [0, rows - 1]) {
    if (profile[i]![0] !== 0) continue
    const dir = i === 0 ? -1 : 1
    for (let j = 0; j < cols; j++) n.setXYZ(i * cols + j, 0, dir, 0)
  }
  n.needsUpdate = true
  return g
}

/** Kreisbogen für das Profil (Kopf, Kuppeln), Winkel in Grad von unten (−90) nach oben (90). */
export function arc(cx: number, cy: number, radius: number, fromDeg: number, toDeg: number, steps: number): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const a = ((fromDeg + ((toDeg - fromDeg) * i) / steps) * Math.PI) / 180
    out.push([Math.max(0, cx + Math.cos(a) * radius), cy + Math.sin(a) * radius])
  }
  return out
}

/** Glatte Kurve durch Stützpunkte (Catmull-Rom), für weiche Profile. */
export function smooth(points: Profile, perSegment = 4): [number, number][] {
  const pts = points.map(([x, y]) => new THREE.Vector2(x, y))
  const out: [number, number][] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!
    const p1 = pts[i]!
    const p2 = pts[i + 1]!
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!
    for (let s = 0; s < perSegment; s++) {
      const t = s / perSegment
      const t2 = t * t
      const t3 = t2 * t
      const x = 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3)
      const y = 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
      out.push([Math.max(0, x), y])
    }
  }
  const last = points[points.length - 1]!
  out.push([last[0], last[1]])
  return out
}

/** Profil skalieren (Radius und Höhe). */
export function scaleProfile(p: Profile, s: number): [number, number][] {
  return p.map(([r, y]) => [r * s, y * s])
}

// ---------------------------------------------------------------------------
// Personenfiguren

export type PersonKind = 'square' | 'circle' | 'hex'

export interface PersonDims {
  /** Höhe der Halsmitte (Einheiten von r) */
  neck: number
  headR: number
  headY: number
  top: number
}

/** Sockel: flache, leicht gerundete Scheibe wie bei gedrechselten Figuren. */
const PLINTH: Profile = [
  [0, 0],
  [0.9, 0],
  [0.99, 0.015],
  [1.03, 0.06],
  [1.03, 0.11],
  [0.99, 0.15],
  [0.9, 0.17],
]

export function personProfile(kind: PersonKind, child: boolean): { profile: [number, number][]; dims: PersonDims } {
  const hs = child ? 1.18 : 1 // Kinder: grösserer Kopf
  const bs = child ? 0.82 : 1 // Kinder: kürzerer Körper
  const body: [number, number][] =
    kind === 'square'
      ? [
          [0.82, 0.22],
          [0.8, 0.6],
          [0.77, 1.1],
          [0.77, 1.55],
          [0.8, 1.84],
          [0.78, 1.97],
          [0.68, 2.07],
          [0.5, 2.13],
        ]
      : kind === 'circle'
        ? [
            [0.86, 0.22],
            [0.82, 0.45],
            [0.7, 0.95],
            [0.56, 1.45],
            [0.5, 1.72],
            [0.56, 1.9],
            [0.56, 2.0],
            [0.44, 2.11],
          ]
        : [
            [0.8, 0.22],
            [0.78, 0.6],
            [0.72, 1.2],
            [0.7, 1.7],
            [0.74, 1.9],
            [0.66, 2.04],
            [0.46, 2.12],
          ]
  const scaledBody = body.map(([r, y]) => [r, 0.17 + (y - 0.17) * bs] as [number, number])
  const neckY = 0.17 + (2.12 - 0.17) * bs + 0.06
  const neckR = 0.22 * hs
  const headR = (kind === 'circle' ? 0.45 : 0.47) * hs
  const headY = neckY + 0.1 + headR * 0.92
  const profile: [number, number][] = [
    ...PLINTH.map(([r, y]) => [r, y] as [number, number]),
    ...smooth(scaledBody, 4),
    [0.3, neckY - 0.02] as [number, number],
    [neckR, neckY + 0.04] as [number, number],
    ...arc(0, headY, headR, -62, 90, 16),
  ]
  return { profile, dims: { neck: neckY, headR, headY, top: headY + headR } }
}

export function personCross(kind: PersonKind, neckY: number): CrossSection {
  if (kind === 'circle') return ROUND
  const lower = kind === 'square' ? superellipse(3.4) : softHex
  return blendCross(lower, () => 1, neckY - 0.25, neckY)
}

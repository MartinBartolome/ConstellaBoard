import { memo, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { METER, type OutdoorSetting, type RoomSetting } from './scenery'
import { useModel } from './models'
import { tiled, useTextureAsync } from './textures'

/**
 * Die Welt um den Tisch: ein gebauter Raum (Boden, Wände mit Fenstern,
 * Vorhänge, Decke, Teppich, Einrichtung) oder draussen ein echter Boden mit
 * Gras, Steinen und Pflanzen, der in das Panorama übergeht.
 *
 * Alle Masse hier in Metern; die äussere Gruppe skaliert auf Welt-Einheiten.
 * Ursprung: Fussboden unter der Brettmitte, Blick der Kamera nach −z.
 */

/** Detailstufe: Desktop, Handy, Rechner ohne Grafikkarte. */
export type Detail = 'full' | 'lite' | 'minimal'

// ---------------------------------------------------------------------------
// Materialien

/** PBR-Material aus Farb-, Normal- und ORM-Textur mit Kachelgrösse in Metern. */
function usePbr(prefix: string, sizeX: number, sizeY: number, tile: number, tint: string, opts: { normal?: number; rough?: number; flat?: boolean } = {}) {
  const color = useTextureAsync(`tex/${prefix}_color.jpg`)
  // flat: nur Farbe (spart auf Rechnern ohne Grafikkarte viel Zeit)
  const normal = useTextureAsync(opts.flat ? null : `tex/${prefix}_normal.jpg`, 'data')
  const orm = useTextureAsync(opts.flat ? null : `tex/${prefix}_orm.jpg`, 'data')
  const m = useMemo(() => new THREE.MeshStandardMaterial({ color: tint, roughness: opts.rough ?? 1, metalness: 0 }), [tint, opts.rough])
  useEffect(() => {
    const rx = sizeX / tile
    const ry = sizeY / tile
    m.map = tiled(color, rx, ry)
    m.normalMap = tiled(normal, rx, ry)
    m.normalScale.setScalar(opts.normal ?? 1)
    m.roughnessMap = tiled(orm, rx, ry)
    m.aoMap = m.roughnessMap
    m.aoMapIntensity = 0.7
    m.needsUpdate = true
    return () => {
      m.map?.dispose()
      m.normalMap?.dispose()
      m.roughnessMap?.dispose()
    }
  }, [m, color, normal, orm, sizeX, sizeY, tile, opts.normal])
  useEffect(() => () => m.dispose(), [m])
  return m
}

// ---------------------------------------------------------------------------
// Einzelne Modelle aus einem Paket

type Anchor = 'bottom' | 'top' | 'back'

/**
 * Ein Objekt aus einer GLB-Sammlung, auf seine Grundfläche gestellt
 * (bottom), an die Decke gehängt (top) oder mit der Rückseite an die Wand.
 */
function Prop({
  pack,
  name,
  at,
  rot = 0,
  y = 0,
  scale = 1,
  anchor = 'bottom',
  sink = 0,
  shadow = true,
}: {
  pack: THREE.Object3D | null
  name: string
  at: [number, number]
  rot?: number
  y?: number
  scale?: number
  anchor?: Anchor
  sink?: number
  shadow?: boolean
}) {
  const obj = useMemo(() => {
    const src = pack?.getObjectByName(name)
    if (!src) return null
    const c = src.clone()
    c.updateMatrixWorld(true)
    const b = new THREE.Box3().setFromObject(c)
    const cx = (b.min.x + b.max.x) / 2
    const cz = (b.min.z + b.max.z) / 2
    const h = b.max.y - b.min.y
    const oy = anchor === 'top' ? -b.max.y : -b.min.y - sink * h
    c.position.x -= cx
    c.position.z -= anchor === 'back' ? b.min.z : cz
    c.position.y += oy
    c.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.castShadow = shadow
        m.receiveShadow = true
      }
    })
    return c
  }, [pack, name, anchor, sink, shadow])
  if (!obj) return null
  return (
    <group position={[at[0], y, at[1]]} rotation={[0, rot, 0]} scale={scale}>
      <primitive object={obj} />
    </group>
  )
}

// ---------------------------------------------------------------------------
// Raum

const ROOM = { w: 7.6, back: -2.5, front: 3.8, h: 2.75 }
const WIN = { w: 1.3, h: 1.55, sill: 0.8, xs: [-1.55, 1.55] }

/** Rechtecke [x0, y0, x1, y1] als Fläche mit Welt-UVs (Kachelung über alle Teile gleich). */
function rectsGeometry(rects: [number, number, number, number][]): THREE.BufferGeometry {
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (const [x0, y0, x1, y1] of rects) {
    const i = pos.length / 3
    pos.push(x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0)
    uv.push(x0, y0, x1, y0, x1, y1, x0, y1)
    idx.push(i, i + 1, i + 2, i, i + 2, i + 3)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** Rückwand mit zwei Fensteröffnungen. */
function backWallRects(w: number): [number, number, number, number][] {
  const { h } = ROOM
  const r: [number, number, number, number][] = []
  const edges = [-w / 2, ...WIN.xs.flatMap((x) => [x - WIN.w / 2, x + WIN.w / 2]), w / 2]
  for (let i = 0; i < edges.length; i += 2) r.push([edges[i]!, 0, edges[i + 1]!, h])
  for (const x of WIN.xs) {
    r.push([x - WIN.w / 2, 0, x + WIN.w / 2, WIN.sill])
    r.push([x - WIN.w / 2, WIN.sill + WIN.h, x + WIN.w / 2, h])
  }
  return r
}

/** Gefalteter Vorhang (Stoff mit leichtem Wellenwurf). */
function curtainGeometry(width: number, height: number, folds: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(width, height, folds * 6, 1)
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    p.setZ(i, Math.sin(((x + width / 2) / width) * Math.PI * 2 * folds) * 0.035 + 0.04)
  }
  g.computeVertexNormals()
  return g
}

const box = new THREE.BoxGeometry(1, 1, 1)

function WindowFrame({ x, z, white }: { x: number; z: number; white: THREE.Material }) {
  const t = 0.06
  const d = 0.1
  const { w, h, sill } = WIN
  const glass = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#dfe9ef', transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0, depthWrite: false }),
    [],
  )
  useEffect(() => () => glass.dispose(), [glass])
  const parts: [number, number, number, number, number, number][] = [
    // [x, y, z, sx, sy, sz]
    [x, sill + t / 2, z, w, t, d],
    [x, sill + h - t / 2, z, w, t, d],
    [x - w / 2 + t / 2, sill + h / 2, z, t, h, d],
    [x + w / 2 - t / 2, sill + h / 2, z, t, h, d],
    [x, sill + h / 2, z, t * 0.7, h, d * 0.8], // Mittelsprosse
    [x, sill + h * 0.68, z, w, t * 0.7, d * 0.8], // Kämpfer
    [x, sill - 0.015, z + 0.12, w + 0.16, 0.03, 0.26], // Fensterbank
  ]
  return (
    <>
      {parts.map(([px, py, pz, sx, sy, sz], i) => (
        <mesh key={i} geometry={box} material={white} position={[px, py, pz]} scale={[sx, sy, sz]} castShadow receiveShadow />
      ))}
      <mesh position={[x, sill + h / 2, z]} material={glass}>
        <planeGeometry args={[w, h]} />
      </mesh>
    </>
  )
}

export const Room = memo(function Room({ setting, origin, tableSize }: { setting: RoomSetting; origin: [number, number, number]; tableSize: [number, number] }) {
  const w = Math.max(ROOM.w, tableSize[0] / METER + 3.4)
  const depth = ROOM.front - ROOM.back
  const floor = usePbr(`raum/${setting.floor}`, w, depth, setting.floorTile, '#ffffff', { normal: 0.6 })
  const wall = usePbr(`raum/${setting.wall}`, 1, 1, 1.4, setting.wallTint, { normal: 0.5 })
  const ceiling = usePbr(`raum/${setting.wall}`, w, depth, 1.4, '#f6f2ec', { normal: 0.3 })
  const rug = usePbr('raum/teppich', 2.9, 2.1, 0.7, setting.rug ?? '#ffffff', { normal: 0.8 })
  const linen = useTextureAsync('tex/leinen_color.jpg')
  const white = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f3f0ea', roughness: 0.55 }), [])
  const curtain = useMemo(() => new THREE.MeshStandardMaterial({ color: '#efe6d6', roughness: 1 }), [])
  useEffect(() => {
    curtain.map = tiled(linen, 1.5, 3)
    curtain.needsUpdate = true
    return () => curtain.map?.dispose()
  }, [curtain, linen])
  useEffect(
    () => () => {
      white.dispose()
      curtain.dispose()
    },
    [white, curtain],
  )
  const back = useMemo(() => rectsGeometry(backWallRects(w)), [w])
  // Seitenwände: lokale x-Achse zeigt je nach Drehung nach −z oder +z
  const left = useMemo(() => rectsGeometry([[-ROOM.front, 0, -ROOM.back, ROOM.h]]), [])
  const right = useMemo(() => rectsGeometry([[ROOM.back, 0, ROOM.front, ROOM.h]]), [])
  const front = useMemo(() => rectsGeometry([[-w / 2, 0, w / 2, ROOM.h]]), [w])
  const curtainGeo = useMemo(() => curtainGeometry(0.55, WIN.sill + WIN.h + 0.35, 3), [])
  useEffect(
    () => () => {
      back.dispose()
      left.dispose()
      right.dispose()
      front.dispose()
      curtainGeo.dispose()
    },
    [back, left, right, front, curtainGeo],
  )

  const pack = useModel(`raum-${setting.theme}`)
  const T = 0.18 // Wanddicke

  return (
    <group position={origin} scale={METER}>
      {/* Boden */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, (ROOM.back + ROOM.front) / 2]} material={floor} receiveShadow raycast={() => null}>
        <planeGeometry args={[w, depth]} />
      </mesh>
      {/* Decke */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, ROOM.h, (ROOM.back + ROOM.front) / 2]} material={ceiling} raycast={() => null}>
        <planeGeometry args={[w, depth]} />
      </mesh>
      {/* Wände: nur von innen sichtbar, so bleibt der Blick frei, wenn die Kamera hinausfährt */}
      <mesh geometry={back} material={wall} position={[0, 0, ROOM.back]} receiveShadow raycast={() => null} />
      <mesh geometry={front} material={wall} position={[0, 0, ROOM.front]} rotation={[0, Math.PI, 0]} raycast={() => null} />
      <mesh geometry={left} material={wall} position={[-w / 2, 0, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow raycast={() => null} />
      <mesh geometry={right} material={wall} position={[w / 2, 0, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow raycast={() => null} />
      {/* Fenster mit Laibung, Rahmen und Vorhängen */}
      {WIN.xs.map((x) => (
        <group key={x}>
          <mesh geometry={box} material={wall} position={[x - WIN.w / 2 - 0.005, WIN.sill + WIN.h / 2, ROOM.back - T / 2]} scale={[0.01, WIN.h, T]} />
          <mesh geometry={box} material={wall} position={[x + WIN.w / 2 + 0.005, WIN.sill + WIN.h / 2, ROOM.back - T / 2]} scale={[0.01, WIN.h, T]} />
          <mesh geometry={box} material={wall} position={[x, WIN.sill + WIN.h + 0.005, ROOM.back - T / 2]} scale={[WIN.w, 0.01, T]} />
          <mesh geometry={box} material={wall} position={[x, WIN.sill - 0.005, ROOM.back - T / 2]} scale={[WIN.w, 0.01, T]} />
          <WindowFrame x={x} z={ROOM.back - T * 0.6} white={white} />
          <mesh geometry={curtainGeo} material={curtain} position={[x - WIN.w / 2 - 0.22, (WIN.sill + WIN.h + 0.35) / 2 + 0.02, ROOM.back]} castShadow />
          <mesh geometry={curtainGeo} material={curtain} position={[x + WIN.w / 2 + 0.22, (WIN.sill + WIN.h + 0.35) / 2 + 0.02, ROOM.back]} castShadow />
        </group>
      ))}
      {/* Vorhangstange */}
      <mesh geometry={box} material={white} position={[0, WIN.sill + WIN.h + 0.33, ROOM.back + 0.08]} scale={[w - 0.6, 0.03, 0.03]} />
      {/* Sockelleisten */}
      <mesh geometry={box} material={white} position={[0, 0.045, ROOM.back + 0.008]} scale={[w, 0.09, 0.016]} />
      <mesh geometry={box} material={white} position={[-w / 2 + 0.008, 0.045, (ROOM.back + ROOM.front) / 2]} scale={[0.016, 0.09, depth]} />
      <mesh geometry={box} material={white} position={[w / 2 - 0.008, 0.045, (ROOM.back + ROOM.front) / 2]} scale={[0.016, 0.09, depth]} />
      {/* Teppich */}
      {setting.rug && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} material={rug} receiveShadow raycast={() => null}>
          <planeGeometry args={[2.9, 2.1]} />
        </mesh>
      )}
      <RoomProps theme={setting.theme} pack={pack} w={w} />
    </group>
  )
})

/** Einrichtung je Raum (Meter, Ursprung unter der Brettmitte). */
function RoomProps({ theme, pack, w }: { theme: RoomSetting['theme']; pack: THREE.Object3D | null; w: number }) {
  const L = -w / 2
  const R = w / 2
  const B = ROOM.back
  const H = ROOM.h
  if (theme === 'wohnzimmer')
    return (
      <>
        <Prop pack={pack} name="sofa_03" at={[R - 0.5, -0.2]} rot={-Math.PI / 2} />
        <Prop pack={pack} name="throw_pillows_01_pillow01" at={[R - 0.62, -0.75]} y={0.44} rot={-Math.PI / 2 - 0.2} />
        <Prop pack={pack} name="throw_pillows_01_pillow02" at={[R - 0.62, 0.45]} y={0.44} rot={-Math.PI / 2 + 0.25} />
        <Prop pack={pack} name="side_table_01" at={[R - 0.45, -1.75]} />
        <Prop pack={pack} name="ceramic_vase_01" at={[R - 0.45, -1.75]} y={0.55} />
        <Prop pack={pack} name="wooden_bookshelf_worn" at={[L + 0.3, -0.9]} rot={Math.PI / 2} />
        <Prop pack={pack} name="wicker_basket_01" at={[L + 0.35, 0.6]} rot={0.4} />
        <Prop pack={pack} name="calathea_orbifolia_01_a" at={[0, B + 0.35]} scale={1.4} />
        <Prop pack={pack} name="hanging_picture_frame_01" at={[L + 0.01, 0.9]} y={1.55} rot={Math.PI / 2} anchor="back" />
        <Prop pack={pack} name="modern_ceiling_lamp_01" at={[0, 0]} y={H} anchor="top" shadow={false} />
      </>
    )
  if (theme === 'atelier')
    return (
      <>
        <Prop pack={pack} name="painted_wooden_shelves" at={[L + 0.2, -1.2]} rot={Math.PI / 2} anchor="back" />
        <Prop pack={pack} name="standing_picture_frame_01" at={[L + 0.2, -1.1]} y={1.12} rot={Math.PI / 2 + 0.3} />
        <Prop pack={pack} name="wicker_basket_01" at={[L + 0.35, -0.3]} rot={0.3} />
        <Prop pack={pack} name="Sofa_01" at={[R - 0.4, 0]} rot={-Math.PI / 2} />
        <Prop pack={pack} name="side_table_01" at={[R - 0.4, -1.3]} />
        <Prop pack={pack} name="anthurium_botany_01_b" at={[R - 0.4, -1.3]} y={0.55} scale={0.9} />
        <Prop pack={pack} name="calathea_orbifolia_01_b" at={[0, B + 0.3]} scale={1.6} />
        <Prop pack={pack} name="hanging_picture_frame_02" at={[L + 0.01, 0.9]} y={1.6} rot={Math.PI / 2} anchor="back" />
      </>
    )
  return (
    <>
      <Prop pack={pack} name="ClassicConsole_01" at={[0, B + 0.05]} anchor="back" />
      <Prop pack={pack} name="ceramic_vase_01" at={[-0.45, B + 0.25]} y={0.95} />
      <Prop pack={pack} name="calathea_orbifolia_01_b" at={[0.45, B + 0.22]} y={0.95} scale={0.9} />
      <Prop pack={pack} name="ornate_mirror_01" at={[L + 0.01, -0.6]} y={1.55} rot={Math.PI / 2} anchor="back" scale={1.3} />
      <Prop pack={pack} name="Sofa_01" at={[R - 0.4, -0.2]} rot={-Math.PI / 2} />
      <Prop pack={pack} name="hanging_picture_frame_02" at={[R - 0.01, -0.2]} y={1.6} rot={-Math.PI / 2} anchor="back" />
      <Prop pack={pack} name="Chandelier_02" at={[0, 0]} y={H} anchor="top" shadow={false} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Draussen

/** Zufallszahlen mit festem Startwert: jede Person sieht dieselbe Landschaft. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Freie Sicht: nichts direkt vor der Kamera und nichts unter dem Tisch. */
function free(x: number, z: number, tw: number, td: number): boolean {
  if (Math.abs(x) < tw / 2 + 1.3 && Math.abs(z) < td / 2 + 1.3) return false
  if (z > 0 && Math.abs(x) < 2.5 + z * 0.6) return false
  return true
}

interface Placement {
  name: string
  x: number
  z: number
  rot: number
  scale: number
  sink?: number
}

const PROP_SETS: Record<OutdoorSetting['props'], { name: string; count: number; min: number; max: number; scale: [number, number]; sink?: number }[]> = {
  wiese: [
    { name: 'shrub_03_a', count: 6, min: 2.5, max: 9, scale: [1.2, 2] },
    { name: 'shrub_03_c', count: 6, min: 2.5, max: 9, scale: [1.2, 2] },
    { name: 'shrub_sorrel_01_d', count: 10, min: 2, max: 7, scale: [2, 3.5] },
    { name: 'rock_07', count: 5, min: 3, max: 12, scale: [2, 5], sink: 0.2 },
    { name: 'rock_moss_set_01_rock03', count: 1, min: 9, max: 14, scale: [0.6, 0.8], sink: 0.35 },
    { name: 'fern_02_a', count: 3, min: 4, max: 10, scale: [1, 1.4] },
  ],
  wald: [
    { name: 'fern_02_b', count: 8, min: 2.5, max: 10, scale: [1, 1.5] },
    { name: 'fern_02_c', count: 6, min: 2.5, max: 10, scale: [1, 1.4] },
    { name: 'tree_stump_01', count: 1, min: 4, max: 6, scale: [1, 1.2], sink: 0.3 },
    { name: 'rock_moss_set_01_rock01', count: 1, min: 7, max: 11, scale: [0.6, 0.8], sink: 0.35 },
    { name: 'rock_moss_set_01_rock06', count: 2, min: 6, max: 12, scale: [0.5, 0.8], sink: 0.35 },
    { name: 'shrub_02_b', count: 3, min: 6, max: 13, scale: [0.9, 1.2] },
    { name: 'rock_07', count: 6, min: 2.5, max: 10, scale: [2, 5], sink: 0.2 },
  ],
  ufer: [
    { name: 'rock_moss_set_01_rock03', count: 2, min: 6, max: 12, scale: [0.5, 0.8], sink: 0.35 },
    { name: 'rock_moss_set_01_rock06', count: 1, min: 7, max: 12, scale: [0.5, 0.7], sink: 0.35 },
    { name: 'rock_07', count: 14, min: 2.2, max: 11, scale: [2, 6], sink: 0.2 },
    { name: 'shrub_03_b', count: 4, min: 3, max: 9, scale: [1.2, 1.8] },
  ],
  strand: [
    { name: 'rock_07', count: 8, min: 3, max: 12, scale: [2, 6], sink: 0.25 },
    { name: 'rock_moss_set_01_rock03', count: 1, min: 9, max: 13, scale: [0.6, 0.8], sink: 0.4 },
    { name: 'shrub_02_d', count: 2, min: 8, max: 13, scale: [0.6, 0.9] },
  ],
}

function scatter(kind: OutdoorSetting['props'], tw: number, td: number, detail: Detail): Placement[] {
  const r = rng(kind.length * 7919 + 17)
  const out: Placement[] = []
  for (const s of PROP_SETS[kind]) {
    const n = detail === 'full' ? s.count : Math.ceil(s.count / (detail === 'lite' ? 2 : 4))
    let tries = 0
    for (let i = 0; i < n && tries < 200; tries++) {
      // eher hinter und neben dem Tisch, wo man hinschaut
      const a = -Math.PI / 2 + (r() - 0.5) * Math.PI * 1.7
      const d = s.min + Math.sqrt(r()) * (s.max - s.min)
      const x = Math.cos(a) * d
      const z = Math.sin(a) * d
      if (!free(x, z, tw, td)) continue
      out.push({ name: s.name, x, z, rot: r() * Math.PI * 2, scale: s.scale[0] + r() * (s.scale[1] - s.scale[0]), sink: s.sink })
      i++
    }
  }
  return out
}

/** Grashalme als Instanzen: Büschel aus schmalen, gebogenen Halmen. */
function useGrass(count: number, tw: number, td: number) {
  return useMemo(() => {
    if (count <= 0) return null
    const blades = 14
    const pos: number[] = []
    const col: number[] = []
    const idx: number[] = []
    const r = rng(4242)
    const base = new THREE.Color('#355a1e')
    const tip = new THREE.Color('#9cc256')
    for (let b = 0; b < blades; b++) {
      const a = r() * Math.PI * 2
      const ox = Math.cos(a) * 0.1 * r()
      const oz = Math.sin(a) * 0.1 * r()
      const h = 0.04 + r() * 0.08
      const lean = (r() - 0.5) * 0.12
      const width = 0.005 + r() * 0.004
      const dir = r() * Math.PI
      const dx = Math.cos(dir) * width
      const dz = Math.sin(dir) * width
      const i = pos.length / 3
      // 3 Segmente, nach oben spitz
      const seg = 3
      for (let s = 0; s <= seg; s++) {
        const t = s / seg
        const k = 1 - t
        const bx = ox + lean * t * t * Math.cos(a)
        const bz = oz + lean * t * t * Math.sin(a)
        const c = base.clone().lerp(tip, t)
        pos.push(bx - dx * k, h * t, bz - dz * k, bx + dx * k, h * t, bz + dz * k)
        col.push(c.r, c.g, c.b, c.r, c.g, c.b)
      }
      for (let s = 0; s < seg; s++) {
        const q = i + s * 2
        idx.push(q, q + 1, q + 3, q, q + 3, q + 2)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide })
    const mesh = new THREE.InstancedMesh(geo, mat, count)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const v = new THREE.Vector3()
    const s = new THREE.Vector3()
    const tint = new THREE.Color()
    let n = 0
    for (let tries = 0; n < count && tries < count * 4; tries++) {
      const a = r() * Math.PI * 2
      const d = 0.6 + Math.pow(r(), 0.8) * 9
      const x = Math.cos(a) * d
      const z = Math.sin(a) * d
      // nicht direkt vor der Kamera (würde das Brett verdecken)
      if (z > td / 2 && Math.abs(x) < tw / 2 + 0.3) continue
      e.set(0, r() * Math.PI * 2, 0)
      q.setFromEuler(e)
      const sc = 0.7 + r() * 0.8
      s.set(sc, sc * (0.8 + r() * 0.5), sc)
      m.compose(v.set(x, 0, z), q, s)
      mesh.setMatrixAt(n, m)
      mesh.setColorAt(n, tint.setHSL(0.22 + r() * 0.05, 0.35 + r() * 0.2, 0.5 + r() * 0.2))
      n++
    }
    mesh.count = n
    mesh.receiveShadow = true
    mesh.raycast = () => {}
    return mesh
  }, [count, tw, td])
}

/** Weicher Übergang des echten Bodens in das Panorama. */
let fadeTex: THREE.Texture | null = null
function fadeTexture(): THREE.Texture {
  if (fadeTex) return fadeTex
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128)
  grd.addColorStop(0, '#fff')
  grd.addColorStop(0.35, '#fff')
  grd.addColorStop(0.75, '#555')
  grd.addColorStop(1, '#000')
  g.fillStyle = grd
  g.fillRect(0, 0, 256, 256)
  fadeTex = new THREE.CanvasTexture(c)
  return fadeTex
}

export const Outdoor = memo(function Outdoor({
  setting,
  origin,
  tableSize,
  detail,
}: {
  setting: OutdoorSetting
  origin: [number, number, number]
  tableSize: [number, number]
  detail: Detail
}) {
  const R = 30
  const ground = usePbr(`boden/${setting.ground}`, R * 2, R * 2, 2.2, setting.tint, { normal: 1, flat: detail === 'minimal' })
  useEffect(() => {
    ground.alphaMap = fadeTexture()
    ground.transparent = true
    ground.needsUpdate = true
  }, [ground])
  const tw = tableSize[0] / METER
  const td = tableSize[1] / METER
  const pack = useModel('natur')
  const places = useMemo(() => scatter(setting.props, tw, td, detail), [setting.props, tw, td, detail])
  // ohne Grafikkarte kein Gras: jeder Halm kostet dort Rechenzeit
  const grass = useGrass(Math.round(setting.grass * { full: 8000, lite: 2000, minimal: 0 }[detail]), tw, td)
  useEffect(
    () => () => {
      grass?.geometry.dispose()
      ;(grass?.material as THREE.Material | undefined)?.dispose()
      grass?.dispose()
    },
    [grass],
  )
  return (
    <group position={origin} scale={METER}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} material={ground} receiveShadow renderOrder={-1} raycast={() => null}>
        <circleGeometry args={[R, 72]} />
      </mesh>
      {grass && <primitive object={grass} />}
      {places.map((p, i) => (
        <Prop key={i} pack={pack} name={p.name} at={[p.x, p.z]} rot={p.rot} scale={p.scale} sink={p.sink} />
      ))}
    </group>
  )
})

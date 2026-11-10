import { memo, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { GroundedSkybox } from 'three/examples/jsm/objects/GroundedSkybox.js'
import { METER, panoramaDirection, panoramaYaw, type BoardStyle, type EnvironmentStyle, type TableSet } from './scenery'
import { useModel } from './models'
import { tiled, useTextureAsync } from './textures'

/** Dicke des Bretts in Welt-Einheiten; die Oberseite liegt auf y = 0. */
export const BOARD_THICKNESS = 0.55

/** Brettfläche in Welt-Koordinaten (Mitte und Masse). */
export interface BoardRect {
  cx: number
  cz: number
  w: number
  d: number
}

/** Ein echtes Systembrett: Holzplatte oder Stoffbespannung im Holzrahmen. */
export const Systembrett = memo(function Systembrett({ rect, style }: { rect: BoardRect; style: BoardStyle }) {
  const color = useTextureAsync(`tex/${style.tex}_color.jpg`)
  const normal = useTextureAsync(`tex/${style.detail ?? style.tex}_normal.jpg`, 'data')
  const orm = useTextureAsync(`tex/${style.detail ?? style.tex}_orm.jpg`, 'data')
  // Rahmen bei Stoffbrettern: Eiche
  const frameColor = useTextureAsync(style.fabric ? 'tex/eiche_color.jpg' : null)

  const { w, d } = rect
  const T = BOARD_THICKNESS
  const rim = style.fabric ? 0.7 : 0

  const top = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: style.tint ?? '#ffffff', roughness: style.roughness, metalness: 0, envMapIntensity: 0.8 })
    return m
  }, [style])
  useEffect(() => {
    const rx = (w - rim * 2) / style.tile
    const ry = (d - rim * 2) / style.tile
    top.map = tiled(color, rx, ry)
    // bis die Textur da ist: Grundfarbe des Bretts statt Weiss
    top.color.set(color ? (style.tint ?? '#ffffff') : style.swatch)
    top.normalMap = tiled(normal, rx, ry)
    top.normalScale.set(style.fabric ? 1.2 : 0.5, style.fabric ? 1.2 : 0.5)
    top.roughnessMap = tiled(orm, rx, ry)
    top.aoMap = top.roughnessMap
    top.aoMapIntensity = 0.6
    top.needsUpdate = true
    return () => {
      top.map?.dispose()
      top.normalMap?.dispose()
      top.roughnessMap?.dispose()
    }
  }, [top, color, normal, orm, w, d, rim, style])
  useEffect(() => () => top.dispose(), [top])

  const frame = useMemo(() => new THREE.MeshStandardMaterial({ color: style.edge, roughness: 0.55, metalness: 0 }), [style])
  useEffect(() => {
    const src = style.fabric ? frameColor : color
    frame.map = tiled(src, w / style.tile, T / style.tile)
    frame.color.set(style.fabric ? style.edge : '#e8e0d6')
    frame.needsUpdate = true
    return () => frame.map?.dispose()
  }, [frame, color, frameColor, style, w, T])
  useEffect(() => () => frame.dispose(), [frame])

  return (
    <group position={[rect.cx, 0, rect.cz]}>
      {/* Korpus mit gerundeten Kanten */}
      <RoundedBox args={[w, T, d]} radius={0.16} smoothness={4} position={[0, -T / 2 - 0.002, 0]} material={frame} castShadow receiveShadow />
      {/* Spielfläche */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} material={top} receiveShadow>
        <planeGeometry args={[w - (rim ? rim * 2 : 0.3), d - (rim ? rim * 2 : 0.3)]} />
      </mesh>
      {style.fabric ? <FabricRim w={w} d={d} rim={rim} m={frame} /> : <Inlay w={w} d={d} />}
    </group>
  )
})

/** Leicht erhöhter Holzrahmen um die Stoffbespannung. */
function FabricRim({ w, d, rim, m }: { w: number; d: number; rim: number; m: THREE.Material }) {
  const h = 0.14
  const bars: [number, number, number, number][] = [
    [0, -(d - rim) / 2, w, rim],
    [0, (d - rim) / 2, w, rim],
    [-(w - rim) / 2, 0, rim, d - rim * 2],
    [(w - rim) / 2, 0, rim, d - rim * 2],
  ]
  return (
    <>
      {bars.map(([x, z, bw, bd], i) => (
        <RoundedBox key={i} args={[bw, h, bd]} radius={0.05} smoothness={2} position={[x, h / 2 - 0.02, z]} material={m} castShadow receiveShadow />
      ))}
    </>
  )
}

/** Feine eingelegte Randlinie, wie bei handgefertigten Brettern. */
function Inlay({ w, d }: { w: number; d: number }) {
  const inset = 0.9
  const t = 0.07
  const m = useMemo(() => new THREE.MeshBasicMaterial({ color: '#3b2a1c', transparent: true, opacity: 0.28, depthWrite: false }), [])
  useEffect(() => () => m.dispose(), [m])
  const W = w - inset * 2
  const D = d - inset * 2
  const lines: [number, number, number, number][] = [
    [0, -D / 2, W, t],
    [0, D / 2, W, t],
    [-W / 2, 0, t, D],
    [W / 2, 0, t, D],
  ]
  return (
    <>
      {lines.map(([x, z, lw, ld], i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.004, z]} material={m}>
          <planeGeometry args={[lw, ld]} />
        </mesh>
      ))}
    </>
  )
}

let shadowTex: THREE.Texture | null = null
/** Weicher, rechteckiger Schatten (Canvas statt ctx.filter, wegen Safari). */
function softShadowTexture(): THREE.Texture {
  if (shadowTex) return shadowTex
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  for (let i = 0; i < 24; i++) {
    const p = 4 + i * 1.6
    g.fillStyle = 'rgba(0,0,0,0.055)'
    g.beginPath()
    g.roundRect(p, p, 128 - p * 2, 128 - p * 2, 24 - i * 0.6)
    g.fill()
  }
  shadowTex = new THREE.CanvasTexture(c)
  shadowTex.colorSpace = THREE.SRGBColorSpace
  return shadowTex
}

/** Kontaktschatten auf dem Boden (der Panorama-Boden nimmt keine echten Schatten an). */
function SoftShadow({ x, y, z, w, d, rot = 0, opacity }: { x: number; y: number; z: number; w: number; d: number; rot?: number; opacity: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, rot]} position={[x, y, z]} renderOrder={1} raycast={() => null}>
      <planeGeometry args={[w, d]} />
      <meshBasicMaterial map={softShadowTexture()} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

/** Höhe des Fussbodens: unter der Tischplatte, auf der das Brett liegt. */
export function floorY(set: TableSet): number {
  return -BOARD_THICKNESS - set.height * METER
}

interface Placed {
  x: number
  z: number
  rot: number
}

/** Stühle hinter dem Tisch und an den Stirnseiten; vorne sitzt man selbst. */
export function chairPlaces(set: TableSet, w: number, d: number): Placed[] {
  if (!set.chair) return []
  const cw = (set.chairWidth ?? 0.5) * METER
  const tuck = 0.16 * METER
  const n = Math.max(1, Math.min(3, Math.floor(w / (cw * 1.7))))
  const out: Placed[] = []
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 0 : -w / 2 + (w / n) * (i + 0.5)
    // leicht unregelmässig, wie wirklich benutzte Stühle
    out.push({ x: x + (i % 2 ? 0.6 : -0.4), z: -d / 2 - tuck - (i % 2) * 1.2, rot: (i % 2 ? -0.06 : 0.05) })
  }
  out.push({ x: -w / 2 - tuck - 1, z: 0.8, rot: Math.PI / 2 + 0.08 })
  out.push({ x: w / 2 + tuck + 2, z: -0.6, rot: -Math.PI / 2 - 0.12 })
  return out
}

/**
 * Tisch (und Stühle) passend zur Umgebung. Wird das Brett grösser als die
 * Tischplatte, wächst der Tisch in der Fläche mit.
 */
export const Furniture = memo(function Furniture({ set, rect, shadow }: { set: TableSet; rect: BoardRect; shadow: number }) {
  const table = useModel(set.table)
  const chair = useModel(set.chair)
  const topW = set.top[0] * METER
  const topD = set.top[1] * METER
  const sx = Math.max(1, (rect.w + 5) / topW)
  const sz = Math.max(1, (rect.d + 5) / topD)
  const w = topW * sx
  const d = topD * sz
  const y = floorY(set)

  const tableObj = useMemo(() => table?.clone() ?? null, [table])
  // Grundfläche des Tischs (mit Bänken) für den Bodenschatten
  const foot = useMemo(() => {
    if (!table) return [w, d] as const
    const b = new THREE.Box3().setFromObject(table)
    const ex = (b.max.x - b.min.x) * METER
    const ez = (b.max.z - b.min.z) * METER
    const turned = Math.abs(Math.sin(set.rotY ?? 0)) > 0.5
    return [(turned ? ez : ex) * sx, (turned ? ex : ez) * sz] as const
  }, [table, set.rotY, sx, sz, w, d])
  const places = useMemo(() => chairPlaces(set, w, d), [set, w, d])
  const chairs = useMemo(() => (chair ? places.map(() => chair.clone()) : []), [chair, places])

  return (
    <group position={[rect.cx, 0, rect.cz]}>
      {tableObj && (
        <group position={[0, y, 0]} scale={[METER * sx, METER, METER * sz]}>
          <primitive object={tableObj} rotation={[0, set.rotY ?? 0, 0]} />
        </group>
      )}
      <SoftShadow x={0} y={y + 0.05} z={0} w={foot[0] * 1.25 + 6} d={foot[1] * 1.25 + 6} opacity={shadow} />
      {chairs.map((c, i) => (
        <group key={i} position={[places[i]!.x, y, places[i]!.z]} rotation={[0, places[i]!.rot, 0]}>
          <primitive object={c} scale={METER} />
          <SoftShadow x={0} y={0.06} z={0} w={(set.chairWidth ?? 0.5) * METER * 1.5} d={(set.chairWidth ?? 0.5) * METER * 1.6} opacity={shadow * 0.8} />
        </group>
      ))}
    </group>
  )
})

/**
 * Umgebung: Panorama (Poly Haven, CC0) als bodenprojizierter Hintergrund –
 * das Brett liegt dadurch wirklich auf der Wiese, am See usw. –, dazu
 * Umgebungslicht aus einem kleinen HDR und eine Sonne mit weichen Schatten.
 */
export function Environment3D({ env, rect, hiRes, shadowSize }: { env: EnvironmentStyle; rect: BoardRect; hiRes: boolean; shadowSize: number }) {
  const { scene, invalidate } = useThree()
  const light = useTextureAsync(`env/${env.file}_light.hdr`, 'hdr')
  const backdrop = useTextureAsync(env.backdrop ? `env/${env.file}_${hiRes ? '4k' : '2k'}.jpg` : null)
  const yaw = panoramaYaw(env)

  useEffect(() => {
    scene.environment = light
    scene.environmentIntensity = env.envIntensity
    scene.environmentRotation.set(0, yaw, 0)
    scene.background = new THREE.Color(env.color)
    scene.fog = env.backdrop ? null : new THREE.Fog(env.color, 140, 420)
    invalidate()
  }, [scene, light, env, yaw, invalidate])

  useEffect(
    () => () => {
      scene.environment = null
      scene.fog = null
    },
    [scene],
  )

  const sky = useMemo(() => {
    if (!backdrop || !env.backdrop || env.groundHeight <= 0) return null
    const s = new GroundedSkybox(backdrop, env.groundHeight, env.radius, 96)
    ;(s.material as THREE.MeshBasicMaterial).toneMapped = false
    ;(s.material as THREE.MeshBasicMaterial).fog = false
    s.renderOrder = -1
    return s
  }, [backdrop, env.backdrop, env.groundHeight, env.radius])
  useEffect(() => {
    invalidate()
    return () => {
      sky?.geometry.dispose()
      ;(sky?.material as THREE.Material | undefined)?.dispose()
    }
  }, [sky, invalidate])

  const sunDir = panoramaDirection(env.sun.u, env.sun.elevation, yaw)
  const dist = 90
  // Brett und Tischplatte darum herum (Stühle und Boden: weiche Kontaktschatten)
  const half = Math.max(rect.w, rect.d) / 2 + 16
  const floor = floorY(env.furniture)

  return (
    <>
      {sky && <primitive object={sky} position={[rect.cx, floor + env.groundHeight, rect.cz]} rotation={[0, yaw, 0]} raycast={() => null} />}
      {!env.backdrop && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[rect.cx, floor, rect.cz]} receiveShadow raycast={() => null}>
          <circleGeometry args={[400, 64]} />
          <meshStandardMaterial color={env.color} roughness={1} />
        </mesh>
      )}
      <Furniture set={env.furniture} rect={rect} shadow={env.backdrop ? 0.7 : 0.45} />
      <hemisphereLight args={['#fffaf0', '#c9b79c', env.backdrop ? 0.2 : 0.35]} />
      <directionalLight
        position={[rect.cx + sunDir[0] * dist, sunDir[1] * dist, rect.cz + sunDir[2] * dist]}
        intensity={env.sun.intensity}
        color={env.sun.color}
        castShadow
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.02}
        shadow-radius={4}
        shadow-camera-left={-half}
        shadow-camera-right={half}
        shadow-camera-top={half}
        shadow-camera-bottom={-half}
        shadow-camera-near={1}
        shadow-camera-far={dist * 2}
      >
        <object3D attach="target" position={[rect.cx, 0, rect.cz]} />
      </directionalLight>
    </>
  )
}

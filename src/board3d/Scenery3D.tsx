import { memo, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { GroundedSkybox } from 'three/examples/jsm/objects/GroundedSkybox.js'
import { panoramaDirection, panoramaYaw, type BoardStyle, type EnvironmentStyle } from './scenery'
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

/** Weicher Kontaktschatten des Bretts auf dem Boden der Umgebung. */
function GroundShadow({ rect, strength }: { rect: BoardRect; strength: number }) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')!
    // konzentrische, abgerundete Rechtecke statt ctx.filter (Safari)
    for (let i = 0; i < 24; i++) {
      const p = 4 + i * 1.6
      g.fillStyle = `rgba(0,0,0,${0.055})`
      g.beginPath()
      g.roundRect(p, p, 128 - p * 2, 128 - p * 2, 24 - i * 0.6)
      g.fill()
    }
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  useEffect(() => () => tex.dispose(), [tex])
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[rect.cx, -BOARD_THICKNESS - 0.01, rect.cz]} renderOrder={1}>
      <planeGeometry args={[rect.w * 1.28 + 3, rect.d * 1.28 + 3]} />
      <meshBasicMaterial map={tex} transparent opacity={strength} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

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
    scene.fog = env.backdrop ? null : new THREE.Fog(env.color, 70, 190)
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
    const s = new GroundedSkybox(backdrop, env.groundHeight, 900, 96)
    ;(s.material as THREE.MeshBasicMaterial).toneMapped = false
    ;(s.material as THREE.MeshBasicMaterial).fog = false
    s.renderOrder = -1
    return s
  }, [backdrop, env.backdrop, env.groundHeight])
  useEffect(() => {
    invalidate()
    return () => {
      sky?.geometry.dispose()
      ;(sky?.material as THREE.Material | undefined)?.dispose()
    }
  }, [sky, invalidate])

  const sunDir = panoramaDirection(env.sun.u, env.sun.elevation, yaw)
  const dist = 70
  const half = Math.max(rect.w, rect.d) / 2 + 6

  return (
    <>
      {sky && <primitive object={sky} position={[rect.cx, env.groundHeight - BOARD_THICKNESS, rect.cz]} rotation={[0, yaw, 0]} raycast={() => null} />}
      {!env.backdrop && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[rect.cx, -BOARD_THICKNESS - 0.02, rect.cz]} receiveShadow raycast={() => null}>
          <circleGeometry args={[400, 64]} />
          <meshStandardMaterial color={env.color} roughness={1} />
        </mesh>
      )}
      <GroundShadow rect={rect} strength={env.backdrop ? 0.75 : 0.45} />
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

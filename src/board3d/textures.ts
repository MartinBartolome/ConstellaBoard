import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { asset } from './scenery'

/**
 * Texturen werden einmal geladen und von allen Figuren geteilt. Die Hooks
 * liefern `null`, solange eine Datei lädt: Die Szene erscheint sofort und
 * bekommt ihre Oberflächen nach, statt leer zu warten.
 */

const cache = new Map<string, Promise<THREE.Texture>>()
const loaded = new Map<string, THREE.Texture>()

type Kind = 'color' | 'data' | 'hdr'

function load(path: string, kind: Kind): Promise<THREE.Texture> {
  const key = `${kind}:${path}`
  let p = cache.get(key)
  if (!p) {
    p = new Promise<THREE.Texture>((resolve, reject) => {
      const done = (t: THREE.Texture) => {
        loaded.set(key, t)
        resolve(t)
      }
      if (kind === 'hdr') {
        new HDRLoader().load(
          asset(path),
          (t) => {
            t.mapping = THREE.EquirectangularReflectionMapping
            done(t)
          },
          undefined,
          reject,
        )
      } else {
        new THREE.TextureLoader().load(
          asset(path),
          (t) => {
            t.colorSpace = kind === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace
            t.anisotropy = 4
            done(t)
          },
          undefined,
          reject,
        )
      }
    })
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return p
}

export function useTextureAsync(path: string | null, kind: Kind = 'color'): THREE.Texture | null {
  const key = path ? `${kind}:${path}` : ''
  const [state, setState] = useState<{ key: string; tex: THREE.Texture | null }>(() => ({ key, tex: path ? (loaded.get(key) ?? null) : null }))
  useEffect(() => {
    if (!path) return
    let alive = true
    const ready = loaded.get(key)
    if (ready) setState({ key, tex: ready })
    else
      load(path, kind).then(
        (t) => alive && setState({ key, tex: t }),
        () => alive && setState({ key, tex: null }),
      )
    return () => {
      alive = false
    }
  }, [path, kind, key])
  if (!path) return null
  // Nach einem Wechsel nie die alte Textur unter neuem Namen liefern
  if (state.key !== key) return loaded.get(key) ?? null
  return state.tex
}

/** Wiederholende Kopie einer geteilten Textur (eigene repeat-Werte). */
export function tiled(t: THREE.Texture | null, repeatX: number, repeatY = repeatX): THREE.Texture | null {
  if (!t) return null
  const c = t.clone()
  c.wrapS = c.wrapT = THREE.RepeatWrapping
  c.repeat.set(repeatX, repeatY)
  c.needsUpdate = true
  return c
}

export interface WoodMaps {
  map: THREE.Texture | null
  normalMap: THREE.Texture | null
  roughnessMap: THREE.Texture | null
}

/** Holzmaserung der Figuren (hell, wird mit der Figurenfarbe eingefärbt). */
export function useFigureWood(): WoodMaps {
  const map = useTextureAsync('tex/figur_color.jpg')
  const normalMap = useTextureAsync('tex/figur_normal.jpg', 'data')
  const roughnessMap = useTextureAsync('tex/figur_orm.jpg', 'data')
  return { map: prep(map), normalMap: prep(normalMap), roughnessMap: prep(roughnessMap) }
}

function prep(t: THREE.Texture | null): THREE.Texture | null {
  if (t && t.wrapS !== THREE.RepeatWrapping) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.needsUpdate = true
  }
  return t
}

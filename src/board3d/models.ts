import { useEffect, useState } from 'react'
import type * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { asset } from './scenery'

/**
 * Möbel-Modelle (GLB, Texturen eingebettet). Jede Datei wird einmal geladen;
 * wer sie braucht, bekommt `null`, bis sie da ist, und hängt dann eine Kopie
 * ein (Geometrie und Materialien werden geteilt).
 */

const cache = new Map<string, Promise<THREE.Object3D>>()
const loaded = new Map<string, THREE.Object3D>()

function load(file: string): Promise<THREE.Object3D> {
  let p = cache.get(file)
  if (!p) {
    p = new GLTFLoader().loadAsync(asset(`moebel/${file}.glb`)).then((g) => {
      g.scene.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        m.castShadow = true
        m.receiveShadow = true
        // Möbel nehmen keine Klicks an: Ziehen über den Brettrand bleibt möglich
        m.raycast = () => {}
      })
      loaded.set(file, g.scene)
      return g.scene
    })
    p.catch(() => cache.delete(file))
    cache.set(file, p)
  }
  return p
}

export function useModel(file: string | undefined): THREE.Object3D | null {
  const [state, setState] = useState<{ file?: string; obj: THREE.Object3D | null }>(() => ({ file, obj: file ? (loaded.get(file) ?? null) : null }))
  useEffect(() => {
    if (!file) return
    let alive = true
    const ready = loaded.get(file)
    if (ready) setState({ file, obj: ready })
    else
      load(file).then(
        (o) => alive && setState({ file, obj: o }),
        () => alive && setState({ file, obj: null }),
      )
    return () => {
      alive = false
    }
  }, [file])
  if (!file) return null
  if (state.file !== file) return loaded.get(file) ?? null
  return state.obj
}

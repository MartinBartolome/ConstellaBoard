import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { BOARD_STYLES, ENVIRONMENTS, getBoardStyle, getEnvironment, panoramaDirection, panoramaYaw } from './scenery'
import { personCross, personProfile, revolve, softHex, superellipse } from './geometry3d'
import { boardRectOf } from './Board3D'
import { newFigure } from '../domain/commands'
import { emptyBoard } from '../domain/types'

describe('Umgebungen und Bretter', () => {
  it('haben eindeutige IDs und Rückfall auf den ersten Eintrag', () => {
    expect(new Set(ENVIRONMENTS.map((e) => e.id)).size).toBe(ENVIRONMENTS.length)
    expect(new Set(BOARD_STYLES.map((b) => b.id)).size).toBe(BOARD_STYLES.length)
    expect(getEnvironment('gibt-es-nicht')).toBe(ENVIRONMENTS[0])
    expect(getBoardStyle('gibt-es-nicht')).toBe(BOARD_STYLES[0])
  })

  it('dreht das Panorama so, dass viewU hinter dem Brett (−z) liegt', () => {
    for (const env of ENVIRONMENTS) {
      const [x, y, z] = panoramaDirection(env.viewU, 0, panoramaYaw(env))
      expect(y).toBeCloseTo(0)
      expect(x).toBeCloseTo(0)
      expect(z).toBeCloseTo(-1)
    }
  })

  it('Sonne liegt über dem Horizont', () => {
    for (const env of ENVIRONMENTS) expect(panoramaDirection(env.sun.u, env.sun.elevation, panoramaYaw(env))[1]).toBeGreaterThan(0)
  })
})

describe('Systembrett-Grösse', () => {
  it('hat eine Mindestgrösse und wächst mit den Figuren', () => {
    const empty = boardRectOf([])
    expect(empty.w).toBeGreaterThanOrEqual(20)
    expect(empty.d).toBeGreaterThanOrEqual(14)
    const far = newFigure(emptyBoard(), 'mann', 2000, -1000)
    const r = boardRectOf([far])
    // Figur (x = 100, z = −50 in Welt-Einheiten) liegt auf dem Brett
    expect(r.cx + r.w / 2).toBeGreaterThan(100)
    expect(r.cz - r.d / 2).toBeLessThan(-50)
  })
})

describe('Gedrechselte Figuren', () => {
  it('Normalen zeigen nach aussen', () => {
    for (const kind of ['square', 'circle', 'hex'] as const) {
      const { profile, dims } = personProfile(kind, false)
      const g = revolve(profile, 32, personCross(kind, dims.neck))
      const p = g.getAttribute('position')
      const n = g.getAttribute('normal')
      const v = new THREE.Vector3()
      const w = new THREE.Vector3()
      let outward = 0
      let total = 0
      for (let i = 0; i < p.count; i++) {
        v.set(p.getX(i), 0, p.getZ(i))
        if (v.length() < 0.2) continue
        w.set(n.getX(i), 0, n.getZ(i))
        total++
        if (v.dot(w) > 0) outward++
      }
      expect(outward / total).toBeGreaterThan(0.97)
      expect(dims.top).toBeGreaterThan(2.8)
    }
  })

  it('Querschnitte bleiben nahe am Kreis', () => {
    const sq = superellipse(3.4)
    for (let t = 0; t < Math.PI * 2; t += 0.1) {
      expect(sq(t)).toBeGreaterThan(0.85)
      expect(sq(t)).toBeLessThan(1.15)
      expect(softHex(t)).toBeGreaterThan(0.85)
      expect(softHex(t)).toBeLessThan(1.01)
    }
  })
})

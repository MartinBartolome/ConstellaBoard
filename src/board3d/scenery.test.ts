import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { existsSync } from 'node:fs'
import { BOARD_STYLES, ENVIRONMENTS, METER, TABLES, getBoardStyle, getEnvironment, panoramaDirection, panoramaYaw } from './scenery'
import { personCross, personProfile, revolve, softHex, superellipse } from './geometry3d'
import { boardRectOf } from './Board3D'
import { chairPlaces, floorY } from './Scenery3D'
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

describe('Tisch und Stühle', () => {
  it('jede Umgebung hat einen Tisch, dessen Modell vorhanden ist', () => {
    for (const env of ENVIRONMENTS) {
      const set = env.furniture
      expect(existsSync(`public/3d/moebel/${set.table}.glb`)).toBe(true)
      if (set.chair) expect(existsSync(`public/3d/moebel/${set.chair}.glb`)).toBe(true)
      // Fussboden unter der Tischplatte
      expect(floorY(set)).toBeLessThan(-20)
    }
  })

  it('Stühle stehen neben dem Tisch, nie vorne (dort sitzt man selbst)', () => {
    const w = TABLES.esstisch.top[0] * METER
    const d = TABLES.esstisch.top[1] * METER
    const places = chairPlaces(TABLES.esstisch, w, d)
    expect(places.length).toBeGreaterThanOrEqual(3)
    for (const p of places) {
      expect(Math.abs(p.x) > w / 2 || Math.abs(p.z) > d / 2).toBe(true)
      expect(p.z).toBeLessThan(d / 2)
    }
    expect(chairPlaces(TABLES.picknick, 100, 40)).toEqual([])
  })
})

describe('Räume und Landschaften', () => {
  it('jede Szene hat ihre Texturen und Modelle', () => {
    for (const env of ENVIRONMENTS) {
      const s = env.setting
      if (!s) continue
      if (s.kind === 'room') {
        expect(existsSync(`public/3d/moebel/raum-${s.theme}.glb`)).toBe(true)
        for (const t of [s.floor, s.wall]) expect(existsSync(`public/3d/tex/raum/${t}_color.jpg`)).toBe(true)
        expect(existsSync(`public/3d/env/${s.view.file}_2k.jpg`)).toBe(true)
      } else {
        expect(existsSync(`public/3d/tex/boden/${s.ground}_color.jpg`)).toBe(true)
        expect(existsSync('public/3d/moebel/natur.glb')).toBe(true)
      }
      expect(existsSync(`public/3d/env/${env.file}_light.hdr`)).toBe(true)
    }
  })
})

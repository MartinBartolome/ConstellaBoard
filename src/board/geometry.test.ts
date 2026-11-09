import { describe, expect, it } from 'vitest'
import { fitRect, toBoard, toScreen, zoomAt, ZOOM_MAX } from './geometry'

describe('Viewport-Geometrie', () => {
  it('rechnet zwischen Bildschirm und Brett um', () => {
    const v = { x: 100, y: 50, k: 2 }
    const p = { x: 30, y: 40 }
    expect(toBoard(v, toScreen(v, p))).toEqual(p)
  })

  it('zoomt um den Zeigerpunkt, der Punkt bleibt stehen', () => {
    const v = { x: 0, y: 0, k: 1 }
    const screen = { x: 200, y: 100 }
    const before = toBoard(v, screen)
    const z = zoomAt(v, screen, 1.5)
    expect(z.k).toBeCloseTo(1.5)
    const after = toBoard(z, screen)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('begrenzt den Zoom', () => {
    expect(zoomAt({ x: 0, y: 0, k: 4 }, { x: 0, y: 0 }, 10).k).toBe(ZOOM_MAX)
  })

  it('passt Inhalte ein', () => {
    const v = fitRect({ x: 0, y: 0, w: 100, h: 100 }, 1000, 800)
    const c = toScreen(v, { x: 50, y: 50 })
    expect(c.x).toBeCloseTo(500)
    expect(c.y).toBeCloseTo(400)
  })
})

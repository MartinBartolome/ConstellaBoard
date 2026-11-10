import { describe, expect, it } from 'vitest'
import { rotationFromYaw, rotationTowards, toBoardPoint, toWorld, yawFromRotation } from './coords'

describe('3D-Koordinaten', () => {
  it('rechnet Brettpunkte verlustfrei hin und zurück', () => {
    const [x, z] = toWorld({ x: 140, y: -60 })
    const p = toBoardPoint(x, z)
    expect(p.x).toBeCloseTo(140)
    expect(p.y).toBeCloseTo(-60)
  })

  it('Blickrichtung stimmt mit der 2D-Nase überein', () => {
    // 2D: Drehung θ blickt in Richtung (sin θ, −cos θ). 3D: Modell blickt nach −z,
    // eine Drehung um y mit φ ergibt (−sin φ, −cos φ) in x/z.
    for (const deg of [0, 45, 90, 180, 270, 315]) {
      const phi = yawFromRotation(deg)
      const dir3 = { x: -Math.sin(phi), z: -Math.cos(phi) }
      const rad = (deg * Math.PI) / 180
      const dir2 = { x: Math.sin(rad), y: -Math.cos(rad) }
      expect(dir3.x).toBeCloseTo(dir2.x)
      expect(dir3.z).toBeCloseTo(dir2.y)
      expect(rotationFromYaw(phi)).toBeCloseTo(deg % 360)
    }
  })

  it('berechnet die Drehung zu einem Zielpunkt', () => {
    const c = { x: 0, y: 0 }
    expect(rotationTowards(c, { x: 0, y: -10 })).toBeCloseTo(0)
    expect(rotationTowards(c, { x: 10, y: 0 })).toBeCloseTo(90)
    expect(rotationTowards(c, { x: 0, y: 10 })).toBeCloseTo(180)
    expect(rotationTowards(c, { x: -10, y: 0 })).toBeCloseTo(270)
  })
})

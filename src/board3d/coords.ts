/**
 * Umrechnung zwischen Brett-Koordinaten (2D, Pixel-Einheiten, y nach unten)
 * und der 3D-Welt (Meter-ähnliche Einheiten, y nach oben, Brett liegt in x/z).
 *
 * Beide Ansichten arbeiten auf denselben gespeicherten Daten (x, y, rotation).
 * Die 3D-Ansicht rechnet nur für die Darstellung um und schreibt beim Ziehen
 * wieder Brett-Koordinaten zurück, damit 2D, 3D und alle Teilnehmenden
 * synchron bleiben.
 */

/** 20 Brett-Einheiten = 1 Welt-Einheit */
export const WORLD_SCALE = 1 / 20

export interface BoardPoint {
  x: number
  y: number
}

/** Brettpunkt → Weltkoordinaten [x, z] auf der Brettebene */
export function toWorld(p: BoardPoint): [number, number] {
  return [p.x * WORLD_SCALE, p.y * WORLD_SCALE]
}

/** Weltpunkt auf der Brettebene → Brettpunkt */
export function toBoardPoint(worldX: number, worldZ: number): BoardPoint {
  return { x: worldX / WORLD_SCALE, y: worldZ / WORLD_SCALE }
}

/**
 * Drehwinkel im Brett (Grad, 0 = Blick nach oben/−y, im Uhrzeigersinn)
 * → Drehung um die Hochachse in 3D (Radiant). Ein Modell blickt
 * standardmässig in Richtung −z.
 */
export function yawFromRotation(deg: number): number {
  return (-deg * Math.PI) / 180
}

/** Umkehrung von {@link yawFromRotation}, Ergebnis normalisiert auf [0, 360) */
export function rotationFromYaw(rad: number): number {
  const d = (-rad * 180) / Math.PI
  return ((d % 360) + 360) % 360
}

/** Brett-Drehwinkel (Grad) aus einem Mittelpunkt und einem Zielpunkt im Brett */
export function rotationTowards(center: BoardPoint, target: BoardPoint): number {
  const deg = (Math.atan2(target.x - center.x, -(target.y - center.y)) * 180) / Math.PI
  return ((deg % 360) + 360) % 360
}

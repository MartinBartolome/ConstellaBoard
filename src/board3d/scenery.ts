import { useSyncExternalStore } from 'react'

/**
 * Austauschbare Bretter und Umgebungen der 3D-Ansicht.
 *
 * Alle Texturen und Umgebungen stammen von Poly Haven (CC0, polyhaven.com)
 * und wurden für das Web verkleinert (siehe public/3d/LIZENZEN.md).
 *
 * Die Auswahl ist eine persönliche Einstellung jeder Person (im Browser
 * gespeichert): Klientinnen und Klienten können sich so die Umgebung wählen,
 * in der sie sich wohlfühlen, ohne andere zu stören.
 */

export interface BoardStyle {
  id: string
  name: string
  /** Dateiname-Präfix unter public/3d/tex */
  tex: string
  /** Präfix für Normal-/ORM-Textur, falls geteilt */
  detail?: string
  /** Tönung (für Stoffe, deren Grundtextur grau ist) */
  tint?: string
  /** Farbe der Brettkante */
  edge: string
  /** Wie viele Welt-Einheiten eine Texturkachel abdeckt */
  tile: number
  roughness: number
  /** Stoffbespannung auf einem Holzrahmen */
  fabric?: boolean
  /** Für die Auswahl-Kachel */
  swatch: string
}

export const BOARD_STYLES: BoardStyle[] = [
  { id: 'ahorn', name: 'Ahorn', tex: 'ahorn', edge: '#d9c6a3', tile: 22, roughness: 0.9, swatch: '#e9dcc0' },
  { id: 'eiche', name: 'Eiche', tex: 'eiche', edge: '#a77c4c', tile: 18, roughness: 1.1, swatch: '#b88d5a' },
  { id: 'kirsche', name: 'Kirschbaum', tex: 'kirsche', edge: '#c88a5c', tile: 22, roughness: 0.85, swatch: '#dba077' },
  { id: 'nussbaum', name: 'Nussbaum', tex: 'nussbaum', detail: 'eiche', edge: '#5e4330', tile: 18, roughness: 1, swatch: '#6b4c36' },
  { id: 'filz', name: 'Filz Moos', tex: 'filz', tint: '#7d9476', edge: '#8a6a48', tile: 8, roughness: 1, fabric: true, swatch: '#7d9476' },
  { id: 'filz-sand', name: 'Filz Sand', tex: 'filz', tint: '#d8c7a8', edge: '#8a6a48', tile: 8, roughness: 1, fabric: true, swatch: '#d8c7a8' },
  { id: 'leinen', name: 'Leinen', tex: 'leinen', tint: '#e7dccb', edge: '#b39770', tile: 6, roughness: 0.95, fabric: true, swatch: '#e7dccb' },
  { id: 'nachtblau', name: 'Filz Nachtblau', tex: 'filz', tint: '#4d6178', edge: '#5e4330', tile: 8, roughness: 1, fabric: true, swatch: '#4d6178' },
]

/** Ein Meter in Welt-Einheiten (Brett ca. 65 × 45 cm, Figuren ca. 12 cm). */
export const METER = 40

/** Tisch (und Stühle), auf dem das Brett steht – Modelle von Poly Haven (CC0). */
export interface TableSet {
  /** Datei unter public/3d/moebel */
  table: string
  /** Tischplatte in Metern (x, z) – nach der Drehung */
  top: [number, number]
  /** Höhe der Tischplatte in Metern */
  height: number
  /** Drehung des Tischmodells um die Hochachse */
  rotY?: number
  /** Stuhlmodell; ohne: keine Stühle (z. B. Bänke am Picknicktisch) */
  chair?: string
  /** Breite der Stühle in Metern (für die Verteilung) */
  chairWidth?: number
}

export const TABLES = {
  picknick: { table: 'picknicktisch', top: [2.93, 1.25], height: 0.746, rotY: Math.PI / 2 },
  hell: { table: 'tisch-hell', top: [1.14, 0.7], height: 0.799, chair: 'stuhl-weiss', chairWidth: 0.45 },
  esstisch: { table: 'esstisch', top: [2.04, 1.15], height: 0.786, chair: 'stuhl-leder', chairWidth: 0.46 },
  salon: { table: 'esstisch', top: [2.04, 1.15], height: 0.786, chair: 'sessel-gruen', chairWidth: 0.68 },
} satisfies Record<string, TableSet>

export interface EnvironmentStyle {
  id: string
  name: string
  /** Kurzbeschreibung für die Auswahl */
  mood: string
  /** Dateiname-Präfix unter public/3d/env; null = schlichter Hintergrund */
  file: string
  /** Hintergrundbild (sonst einfarbig) */
  backdrop: boolean
  /** Kamerahöhe der Aufnahme über dem Boden in Welt-Einheiten (Bodenprojektion) */
  groundHeight: number
  /** Radius der Bodenprojektion (Räume klein, Landschaften gross) */
  radius: number
  /** Tisch und Stühle, passend zur Umgebung */
  furniture: TableSet
  /** Horizontale Bildstelle (0–1), die hinter dem Brett liegen soll */
  viewU: number
  /** Sonnenposition im Panorama (u, Höhe in Grad) für den Schattenwurf */
  sun: { u: number; elevation: number; intensity: number; color: string }
  /** Helligkeit des Umgebungslichts */
  envIntensity: number
  /** Hintergrundfarbe, falls kein Panorama */
  color: string
  swatch: string
}

export const ENVIRONMENTS: EnvironmentStyle[] = [
  {
    id: 'atelier',
    name: 'Helles Atelier',
    mood: 'Holz und Tageslicht',
    file: 'atelier',
    backdrop: true,
    groundHeight: 58,
    radius: 260,
    furniture: TABLES.hell,
    viewU: 0.55,
    sun: { u: 0.73, elevation: 34, intensity: 1.3, color: '#fff6ea' },
    envIntensity: 1.0,
    color: '#e9e0d3',
    swatch: '',
  },
  {
    id: 'wohnzimmer',
    name: 'Wohnzimmer',
    mood: 'Sofa und Kamin',
    file: 'wohnzimmer',
    backdrop: true,
    groundHeight: 58,
    radius: 240,
    furniture: TABLES.esstisch,
    viewU: 0.6,
    sun: { u: 0.63, elevation: 32, intensity: 1.2, color: '#fff3e2' },
    envIntensity: 0.95,
    color: '#e6dccd',
    swatch: '',
  },
  {
    id: 'salon',
    name: 'Salon',
    mood: 'Klassisch und warm',
    file: 'salon',
    backdrop: true,
    groundHeight: 58,
    radius: 240,
    furniture: TABLES.salon,
    viewU: 0.58,
    sun: { u: 0.58, elevation: 30, intensity: 1.1, color: '#fff1dc' },
    envIntensity: 1.0,
    color: '#cdb994',
    swatch: '',
  },
  {
    id: 'raum',
    name: 'Ruhiger Raum',
    mood: 'Hell und schlicht',
    file: 'raum',
    backdrop: false,
    groundHeight: 0,
    radius: 0,
    furniture: TABLES.hell,
    viewU: 0.25,
    sun: { u: 0.23, elevation: 50, intensity: 1.6, color: '#fff4e2' },
    envIntensity: 0.55,
    color: '#efe7da',
    swatch: 'linear-gradient(160deg,#f7f1e7,#e2d6c4)',
  },
  {
    id: 'alpenwiese',
    name: 'Alpenwiese',
    mood: 'Weite und Berge',
    file: 'alpenwiese',
    backdrop: true,
    groundHeight: 64,
    radius: 900,
    furniture: TABLES.picknick,
    viewU: 0.47,
    sun: { u: 0.6, elevation: 42, intensity: 2.4, color: '#fff3dc' },
    envIntensity: 0.9,
    color: '#a9bdd0',
    swatch: '',
  },
  {
    id: 'sommerwiese',
    name: 'Sommerwiese',
    mood: 'Gras und Bäume',
    file: 'sommerwiese',
    backdrop: true,
    groundHeight: 64,
    radius: 900,
    furniture: TABLES.picknick,
    viewU: 0.78,
    sun: { u: 0.6, elevation: 27, intensity: 2.4, color: '#fff1d6' },
    envIntensity: 0.9,
    color: '#9fb6c9',
    swatch: '',
  },
  {
    id: 'waldbach',
    name: 'Waldbach',
    mood: 'Moos, Schatten, Stille',
    file: 'waldbach',
    backdrop: true,
    groundHeight: 64,
    radius: 900,
    furniture: TABLES.picknick,
    viewU: 0.5,
    sun: { u: 0.78, elevation: 55, intensity: 1.1, color: '#f1f6e4' },
    envIntensity: 1.1,
    color: '#55654a',
    swatch: '',
  },
  {
    id: 'seeufer',
    name: 'Am See',
    mood: 'Wasser und Licht',
    file: 'seeufer',
    backdrop: true,
    groundHeight: 64,
    radius: 900,
    furniture: TABLES.picknick,
    viewU: 0.75,
    sun: { u: 0.6, elevation: 32, intensity: 2.3, color: '#fff4e0' },
    envIntensity: 0.9,
    color: '#8aa9c0',
    swatch: '',
  },
  {
    id: 'strand',
    name: 'Sandstrand',
    mood: 'Wärme und Meer',
    file: 'strand',
    backdrop: true,
    groundHeight: 64,
    radius: 900,
    furniture: TABLES.picknick,
    viewU: 0.62,
    sun: { u: 0.64, elevation: 32, intensity: 2.3, color: '#fff2da' },
    envIntensity: 0.9,
    color: '#c9b48e',
    swatch: '',
  },
  {
    id: 'abendfeld',
    name: 'Abendlicht',
    mood: 'Weicher Himmel',
    file: 'abendfeld',
    backdrop: true,
    groundHeight: 64,
    radius: 900,
    furniture: TABLES.picknick,
    viewU: 0.6,
    sun: { u: 0.6, elevation: 22, intensity: 1.3, color: '#ffd9b8' },
    envIntensity: 1.2,
    color: '#c7b7b0',
    swatch: '',
  },
]

export const DEFAULT_BOARD = 'eiche'
export const DEFAULT_ENVIRONMENT = 'alpenwiese'

export function getBoardStyle(id: string): BoardStyle {
  return BOARD_STYLES.find((b) => b.id === id) ?? BOARD_STYLES[0]!
}

export function getEnvironment(id: string): EnvironmentStyle {
  return ENVIRONMENTS.find((e) => e.id === id) ?? ENVIRONMENTS[0]!
}

/** Pfad zu einer Datei unter public/3d (berücksichtigt den Vite-Basis-Pfad). */
export function asset(path: string): string {
  return `${import.meta.env.BASE_URL}3d/${path}`
}

/** Richtung (Einheitsvektor) zu einem Punkt des Panoramas, nach Drehung um yaw. */
export function panoramaDirection(u: number, elevationDeg: number, yaw: number): [number, number, number] {
  const el = (elevationDeg * Math.PI) / 180
  // Gleiche Abbildung wie three.js (equirectUv): u = atan2(z, x) / 2π + 0.5
  const phi = (u - 0.5) * Math.PI * 2 - yaw
  return [Math.cos(phi) * Math.cos(el), Math.sin(el), Math.sin(phi) * Math.cos(el)]
}

/**
 * Drehung des Panoramas um die Hochachse, damit die Bildstelle viewU hinter
 * dem Brett liegt (Kamera blickt anfangs in Richtung −z, das entspricht u = 0.25).
 */
export function panoramaYaw(env: EnvironmentStyle): number {
  return (env.viewU - 0.25) * Math.PI * 2
}

// ---------------------------------------------------------------------------
// Persönliche Einstellungen der 3D-Ansicht

export interface ViewSettings {
  board: string
  environment: string
  /** Sprechblasen anzeigen */
  speech: boolean
}

const KEY = 'constellaboard.view3d'
const DEFAULTS: ViewSettings = { board: DEFAULT_BOARD, environment: DEFAULT_ENVIRONMENT, speech: true }
let current: ViewSettings = read()
const listeners = new Set<() => void>()

function read(): ViewSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<ViewSettings>
    return {
      board: typeof raw.board === 'string' ? getBoardStyle(raw.board).id : DEFAULTS.board,
      environment: typeof raw.environment === 'string' ? getEnvironment(raw.environment).id : DEFAULTS.environment,
      speech: typeof raw.speech === 'boolean' ? raw.speech : DEFAULTS.speech,
    }
  } catch {
    return DEFAULTS
  }
}

export function setViewSettings(patch: Partial<ViewSettings>): void {
  current = { ...current, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // privater Modus o. ä.: nur für diese Sitzung merken
  }
  listeners.forEach((l) => l())
}

export function useViewSettings(): ViewSettings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => current,
    () => DEFAULTS,
  )
}

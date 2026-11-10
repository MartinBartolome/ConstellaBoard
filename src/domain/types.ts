/**
 * Zentrales Datenmodell des Systembretts.
 *
 * Das Brett ist eine Sammlung von Elementen (Figuren, Verbindungen, Notizen).
 * Jedes Feld eines Elements trägt eine eigene Revision (Lamport-Zeitstempel +
 * Client-ID). Dadurch können gleichzeitige Änderungen verschiedener Personen
 * deterministisch zusammengeführt werden („Last Writer Wins" pro Feld), ohne
 * dass eine Änderung eine andere unbemerkt überschreibt, die ein anderes Feld
 * betrifft (z. B. Person A verschiebt, Person B beschriftet dieselbe Figur).
 */

/** Revision: Lamport-Zähler und Client-ID als Tiebreaker. */
export interface Rev {
  /** Lamport-Zähler */
  t: number
  /** Client-ID (zufällig pro Browser-Tab) */
  c: string
}

export type FigureCategory =
  | 'mann'
  | 'frau'
  | 'kind'
  | 'baby'
  | 'neutral'
  | 'tier'
  | 'familie'
  | 'symbol'
  | 'abstrakt'

export interface BaseEntity {
  id: string
  /** Sichtbar für alle Teilnehmenden */
  visible: boolean
  /** Gesperrt: kann nicht bewegt oder verändert werden */
  locked: boolean
  /** Stapelreihenfolge */
  z: number
}

export interface Figure extends BaseEntity {
  kind: 'figure'
  /** ID der Figurvorlage aus der Bibliothek, z. B. "mann", "tier-hund" */
  type: string
  x: number
  y: number
  /** Drehwinkel in Grad, 0 = Blick nach oben */
  rotation: number
  /** Skalierung, 1 = Standardgrösse */
  scale: number
  color: string
  label: string
  groupId: string | null
  /**
   * Einprägsamer Satz, den die Figur „spricht" (Sprechblase).
   * Optional, weil ältere Bretter das Feld noch nicht kennen.
   */
  speech?: string
}

export type ConnectionType =
  | 'normal'
  | 'eng'
  | 'konflikt'
  | 'distanz'
  | 'emotional'
  | 'einseitig'
  | 'frei'

export type LineStyle = 'solid' | 'dashed' | 'dotted' | 'zigzag' | 'double'
export type LineDirection = 'none' | 'forward' | 'backward' | 'both'

export interface Connection extends BaseEntity {
  kind: 'connection'
  type: ConnectionType
  /** ID des Startelements (Figur oder Notiz) */
  from: string
  /** ID des Zielelements */
  to: string
  color: string
  width: number
  style: LineStyle
  direction: LineDirection
  label: string
}

export interface Note extends BaseEntity {
  kind: 'note'
  x: number
  y: number
  width: number
  text: string
  color: string
  rotation: number
  scale: number
  groupId: string | null
}

export type BoardEntity = Figure | Connection | Note
export type EntityKind = BoardEntity['kind']

/** Gespeichertes Element: Daten plus Feldrevisionen. */
export interface StoredEntity<E extends BoardEntity = BoardEntity> {
  data: E
  /** Revision je Feld */
  revs: Record<string, Rev>
}

export interface BoardState {
  /** Schema-Version, für spätere Migrationen */
  schema: 1
  entities: Record<string, StoredEntity>
  /** Gelöschte Elemente mit Lösch-Revision, verhindert „Wiederauferstehung" */
  tombstones: Record<string, Rev>
}

/** Atomare Änderung am Brett. */
export type BoardOp =
  | { op: 'create'; entity: BoardEntity; rev: Rev }
  | { op: 'patch'; id: string; fields: Record<string, unknown>; rev: Rev }
  | { op: 'delete'; id: string; rev: Rev }

export type Patch<E extends BoardEntity> = Partial<Omit<E, 'id' | 'kind'>>

export function emptyBoard(): BoardState {
  return { schema: 1, entities: {}, tombstones: {} }
}

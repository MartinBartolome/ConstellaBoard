import type { ConnectionType, LineDirection, LineStyle } from './types'

export interface ConnectionPreset {
  type: ConnectionType
  name: string
  description: string
  color: string
  width: number
  style: LineStyle
  direction: LineDirection
}

export const CONNECTION_PRESETS: ConnectionPreset[] = [
  { type: 'normal', name: 'Normale Verbindung', description: 'Neutrale Beziehung', color: '#8a8580', width: 2, style: 'solid', direction: 'none' },
  { type: 'eng', name: 'Enge Beziehung', description: 'Starke, nahe Verbindung', color: '#5b7a5a', width: 3, style: 'double', direction: 'none' },
  { type: 'konflikt', name: 'Konflikt', description: 'Spannung oder Streit', color: '#c0704f', width: 2.5, style: 'zigzag', direction: 'none' },
  { type: 'distanz', name: 'Distanz', description: 'Abstand, wenig Kontakt', color: '#8a8580', width: 2, style: 'dotted', direction: 'none' },
  { type: 'emotional', name: 'Emotionale Verbindung', description: 'Gefühlsmässige Bindung', color: '#c98a8f', width: 2.5, style: 'dashed', direction: 'both' },
  { type: 'einseitig', name: 'Einseitige Beziehung', description: 'Geht nur von einer Seite aus', color: '#6f93a8', width: 2.5, style: 'solid', direction: 'forward' },
  { type: 'frei', name: 'Freie Verbindung', description: 'Frei gestaltbar', color: '#3f3d3a', width: 2, style: 'solid', direction: 'none' },
]

export function getPreset(type: ConnectionType): ConnectionPreset {
  return CONNECTION_PRESETS.find((p) => p.type === type) ?? CONNECTION_PRESETS[0]!
}

export const LINE_STYLE_LABELS: Record<LineStyle, string> = {
  solid: 'Durchgezogen',
  dashed: 'Gestrichelt',
  dotted: 'Gepunktet',
  zigzag: 'Zickzack',
  double: 'Doppelt',
}

export const DIRECTION_LABELS: Record<LineDirection, string> = {
  none: 'Ohne Richtung',
  forward: 'Zum Ziel',
  backward: 'Zum Start',
  both: 'Beidseitig',
}

import type { FigureCategory } from './types'

/**
 * Figurenbibliothek. Jede Vorlage beschreibt Kategorie, Name, Standardfarbe,
 * Grundgrösse (Radius in Brett-Einheiten) und die Form, mit der sie gezeichnet wird.
 *
 * Personenfiguren werden – wie auf einem klassischen Systembrett aus Holz –
 * von oben gezeigt und tragen eine „Nase", die die Blickrichtung anzeigt.
 */
export type FigureShape =
  | 'person-square'
  | 'person-circle'
  | 'person-hex'
  | 'person-small-square'
  | 'person-small-circle'
  | 'baby'
  | 'animal'
  | 'family'
  | 'heart'
  | 'star'
  | 'sun'
  | 'tree'
  | 'house'
  | 'stone'
  | 'flame'
  | 'question'
  | 'flag'
  | 'eye'
  | 'triangle'
  | 'diamond'
  | 'ring'
  | 'cloud'
  | 'block'
  | 'wave'

export interface FigureTemplate {
  id: string
  category: FigureCategory
  name: string
  shape: FigureShape
  color: string
  /** Radius in Brett-Einheiten bei Skalierung 1 */
  size: number
  /** Zeigt eine Blickrichtung an */
  directional: boolean
  /** Optionales Emblem in der Figurmitte */
  glyph?: string
}

export const CATEGORY_LABELS: Record<FigureCategory, string> = {
  mann: 'Mann',
  frau: 'Frau',
  kind: 'Kind',
  baby: 'Baby',
  neutral: 'Neutrale Person',
  tier: 'Tier',
  familie: 'Familie',
  symbol: 'Symbol',
  abstrakt: 'Abstrakte Figur',
}

export const CATEGORY_ORDER: FigureCategory[] = [
  'mann',
  'frau',
  'kind',
  'baby',
  'neutral',
  'tier',
  'familie',
  'symbol',
  'abstrakt',
]

/** Ruhige, warme Naturfarben für Figuren und Linien. */
export const PALETTE: { name: string; value: string }[] = [
  { name: 'Moos', value: '#5b7a5a' },
  { name: 'Salbei', value: '#9bb08f' },
  { name: 'Himmel', value: '#6f93a8' },
  { name: 'Nachtblau', value: '#3e5470' },
  { name: 'Terrakotta', value: '#c0704f' },
  { name: 'Sand', value: '#d9b68a' },
  { name: 'Honig', value: '#d9a441' },
  { name: 'Rose', value: '#c98a8f' },
  { name: 'Pflaume', value: '#7d5a78' },
  { name: 'Erde', value: '#7a5c45' },
  { name: 'Stein', value: '#8a8580' },
  { name: 'Anthrazit', value: '#3f3d3a' },
]

const t = (
  id: string,
  category: FigureCategory,
  name: string,
  shape: FigureShape,
  color: string,
  size: number,
  directional: boolean,
  glyph?: string,
): FigureTemplate => ({ id, category, name, shape, color, size, directional, glyph })

export const FIGURE_LIBRARY: FigureTemplate[] = [
  t('mann', 'mann', 'Mann', 'person-square', '#6f93a8', 30, true),
  t('mann-gross', 'mann', 'Mann (gross)', 'person-square', '#3e5470', 38, true),
  t('mann-aelter', 'mann', 'Älterer Mann', 'person-square', '#8a8580', 30, true, 'ring'),
  t('frau', 'frau', 'Frau', 'person-circle', '#c98a8f', 30, true),
  t('frau-gross', 'frau', 'Frau (gross)', 'person-circle', '#7d5a78', 38, true),
  t('frau-aeltere', 'frau', 'Ältere Frau', 'person-circle', '#8a8580', 30, true, 'ring'),
  t('kind-junge', 'kind', 'Junge', 'person-small-square', '#9bb08f', 22, true),
  t('kind-maedchen', 'kind', 'Mädchen', 'person-small-circle', '#d9b68a', 22, true),
  t('kind-neutral', 'kind', 'Kind', 'person-hex', '#d9a441', 22, true),
  t('baby', 'baby', 'Baby', 'baby', '#d9b68a', 16, true),
  t('baby-verstorben', 'baby', 'Ungeborenes / verstorbenes Kind', 'baby', '#8a8580', 16, true, 'ring'),
  t('neutral', 'neutral', 'Neutrale Person', 'person-hex', '#5b7a5a', 30, true),
  t('neutral-klein', 'neutral', 'Neutrale Person (klein)', 'person-hex', '#9bb08f', 22, true),
  t('ich', 'neutral', 'Ich / Fokus', 'person-hex', '#c0704f', 32, true, 'dot'),
  t('tier', 'tier', 'Tier', 'animal', '#7a5c45', 22, true),
  t('tier-gross', 'tier', 'Grosses Tier', 'animal', '#7a5c45', 30, true),
  t('familie-paar', 'familie', 'Paar', 'family', '#5b7a5a', 34, false, '2'),
  t('familie', 'familie', 'Familie', 'family', '#6f93a8', 40, false, '3'),
  t('symbol-herz', 'symbol', 'Herz', 'heart', '#c98a8f', 24, false),
  t('symbol-stern', 'symbol', 'Stern', 'star', '#d9a441', 24, false),
  t('symbol-sonne', 'symbol', 'Sonne / Ressource', 'sun', '#d9a441', 26, false),
  t('symbol-baum', 'symbol', 'Baum / Wurzeln', 'tree', '#5b7a5a', 28, false),
  t('symbol-haus', 'symbol', 'Haus / Heimat', 'house', '#c0704f', 26, false),
  t('symbol-stein', 'symbol', 'Stein / Last', 'stone', '#8a8580', 24, false),
  t('symbol-flamme', 'symbol', 'Flamme / Energie', 'flame', '#c0704f', 24, false),
  t('symbol-frage', 'symbol', 'Frage / Unbekanntes', 'question', '#7d5a78', 22, false),
  t('symbol-ziel', 'symbol', 'Ziel', 'flag', '#3e5470', 24, false),
  t('symbol-auge', 'symbol', 'Beobachter', 'eye', '#3f3d3a', 22, true),
  t('abstrakt-dreieck', 'abstrakt', 'Dreieck', 'triangle', '#d9a441', 26, true),
  t('abstrakt-raute', 'abstrakt', 'Raute', 'diamond', '#6f93a8', 24, false),
  t('abstrakt-ring', 'abstrakt', 'Ring', 'ring', '#5b7a5a', 24, false),
  t('abstrakt-wolke', 'abstrakt', 'Wolke / Gefühl', 'cloud', '#9bb08f', 30, false),
  t('abstrakt-block', 'abstrakt', 'Block / Hindernis', 'block', '#7a5c45', 28, false),
  t('abstrakt-welle', 'abstrakt', 'Welle / Bewegung', 'wave', '#6f93a8', 28, false),
]

const BY_ID = new Map(FIGURE_LIBRARY.map((f) => [f.id, f]))

/** Fallback für unbekannte Typen (z. B. aus späteren Versionen). */
const FALLBACK: FigureTemplate = t('neutral', 'neutral', 'Figur', 'person-hex', '#5b7a5a', 30, true)

export function getTemplate(type: string): FigureTemplate {
  return BY_ID.get(type) ?? FALLBACK
}

export function templatesByCategory(): { category: FigureCategory; label: string; items: FigureTemplate[] }[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    items: FIGURE_LIBRARY.filter((f) => f.category === category),
  }))
}

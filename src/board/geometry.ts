import { getTemplate } from '../domain/library'
import type { BoardEntity, BoardState, Figure, Note } from '../domain/types'

export interface Viewport {
  /** Verschiebung in Bildschirmpixeln */
  x: number
  y: number
  /** Zoomfaktor */
  k: number
}

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export const ZOOM_MIN = 0.15
export const ZOOM_MAX = 5

export function toBoard(v: Viewport, p: Point): Point {
  return { x: (p.x - v.x) / v.k, y: (p.y - v.y) / v.k }
}

export function toScreen(v: Viewport, p: Point): Point {
  return { x: p.x * v.k + v.x, y: p.y * v.k + v.y }
}

/** Zoomt um einen Bildschirmpunkt herum. */
export function zoomAt(v: Viewport, screen: Point, factor: number): Viewport {
  const k = clamp(v.k * factor, ZOOM_MIN, ZOOM_MAX)
  const f = k / v.k
  return { k, x: screen.x - (screen.x - v.x) * f, y: screen.y - (screen.y - v.y) * f }
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function figureRadius(f: Figure): number {
  return getTemplate(f.type).size * f.scale
}

export function noteSize(n: Note): { w: number; h: number } {
  const lines = Math.max(2, Math.ceil(n.text.length / 22) + (n.text.match(/\n/g)?.length ?? 0))
  return { w: n.width * n.scale, h: Math.min(400, 28 + lines * 20) * n.scale }
}

/** Mittelpunkt und „Ankerradius" eines Elements für Verbindungslinien. */
export function anchorOf(e: BoardEntity | undefined): { x: number; y: number; r: number } | null {
  if (!e) return null
  if (e.kind === 'figure') return { x: e.x, y: e.y, r: figureRadius(e) }
  if (e.kind === 'note') {
    const s = noteSize(e)
    return { x: e.x, y: e.y, r: Math.min(s.w, s.h) / 2 }
  }
  return null
}

export function entityBounds(e: BoardEntity, state: BoardState): Rect | null {
  if (e.kind === 'figure') {
    const r = figureRadius(e) * 1.3
    return { x: e.x - r, y: e.y - r, w: r * 2, h: r * 2 + (e.label ? 26 : 0) }
  }
  if (e.kind === 'note') {
    const s = noteSize(e)
    return { x: e.x - s.w / 2, y: e.y - s.h / 2, w: s.w, h: s.h }
  }
  const a = anchorOf(state.entities[e.from]?.data)
  const b = anchorOf(state.entities[e.to]?.data)
  if (!a || !b) return null
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }
}

export function unionRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  for (const r of rects) {
    x1 = Math.min(x1, r.x)
    y1 = Math.min(y1, r.y)
    x2 = Math.max(x2, r.x + r.w)
    y2 = Math.max(y2, r.y + r.h)
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

export function rectContains(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h
}

export function rectIntersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

export function normRect(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }
}

/** Viewport, der ein Rechteck mit Rand in die Fläche einpasst. */
export function fitRect(r: Rect, width: number, height: number, padding = 80): Viewport {
  const k = clamp(Math.min((width - padding * 2) / Math.max(r.w, 1), (height - padding * 2) / Math.max(r.h, 1)), ZOOM_MIN, 1.6)
  return { k, x: width / 2 - (r.x + r.w / 2) * k, y: height / 2 - (r.y + r.h / 2) * k }
}

export function angleDeg(c: Point, p: Point): number {
  return (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

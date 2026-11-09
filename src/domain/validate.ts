import type { BoardEntity, BoardOp, Rev } from './types.ts'

/**
 * Strenge Prüfung eingehender Operationen (Server und Empfänger).
 * Unbekannte Felder, falsche Typen und übergrosse Werte werden abgelehnt.
 */

const ID = /^[A-Za-z0-9_-]{4,64}$/
const COLOR = /^#[0-9a-fA-F]{6}$/
const MAX_OPS_PER_BATCH = 500

const isNum = (v: unknown, min = -1e6, max = 1e6) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
const isStr = (v: unknown, max: number) => typeof v === 'string' && v.length <= max
const isBool = (v: unknown) => typeof v === 'boolean'
const isId = (v: unknown) => typeof v === 'string' && ID.test(v)
const isColor = (v: unknown) => typeof v === 'string' && COLOR.test(v)

type FieldCheck = (v: unknown) => boolean

const COMMON: Record<string, FieldCheck> = {
  visible: isBool,
  locked: isBool,
  z: (v) => isNum(v, -1e7, 1e7),
}

const FIGURE_FIELDS: Record<string, FieldCheck> = {
  ...COMMON,
  type: (v) => typeof v === 'string' && /^[a-z0-9-]{1,40}$/.test(v),
  x: (v) => isNum(v),
  y: (v) => isNum(v),
  rotation: (v) => isNum(v, 0, 360),
  scale: (v) => isNum(v, 0.1, 10),
  color: isColor,
  label: (v) => isStr(v, 80),
  groupId: (v) => v === null || isId(v),
}

const NOTE_FIELDS: Record<string, FieldCheck> = {
  ...COMMON,
  x: (v) => isNum(v),
  y: (v) => isNum(v),
  width: (v) => isNum(v, 40, 1000),
  text: (v) => isStr(v, 1000),
  color: isColor,
  rotation: (v) => isNum(v, 0, 360),
  scale: (v) => isNum(v, 0.1, 10),
  groupId: (v) => v === null || isId(v),
}

const CONNECTION_FIELDS: Record<string, FieldCheck> = {
  ...COMMON,
  type: (v) => typeof v === 'string' && ['normal', 'eng', 'konflikt', 'distanz', 'emotional', 'einseitig', 'frei'].includes(v),
  from: isId,
  to: isId,
  color: isColor,
  width: (v) => isNum(v, 0.5, 20),
  style: (v) => typeof v === 'string' && ['solid', 'dashed', 'dotted', 'zigzag', 'double'].includes(v),
  direction: (v) => typeof v === 'string' && ['none', 'forward', 'backward', 'both'].includes(v),
  label: (v) => isStr(v, 80),
}

const FIELDS_BY_KIND: Record<string, Record<string, FieldCheck>> = {
  figure: FIGURE_FIELDS,
  note: NOTE_FIELDS,
  connection: CONNECTION_FIELDS,
}

function isRev(r: unknown): r is Rev {
  if (!r || typeof r !== 'object') return false
  const o = r as Record<string, unknown>
  return isNum(o.t, 0, 1e12) && Number.isInteger(o.t) && typeof o.c === 'string' && o.c.length > 0 && o.c.length <= 32
}

export function isValidEntity(e: unknown): e is BoardEntity {
  if (!e || typeof e !== 'object') return false
  const o = e as Record<string, unknown>
  const fields = typeof o.kind === 'string' ? FIELDS_BY_KIND[o.kind] : undefined
  if (!fields || !isId(o.id)) return false
  const keys = Object.keys(o).filter((k) => k !== 'id' && k !== 'kind')
  if (keys.length !== Object.keys(fields).length) return false
  return keys.every((k) => fields[k]?.(o[k]) === true)
}

/** Prüft ein Patch gegen die Feldregeln einer Elementart (falls bekannt). */
function isValidPatch(fields: unknown, kind: string | undefined): boolean {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return false
  const entries = Object.entries(fields as Record<string, unknown>)
  if (entries.length === 0 || entries.length > 20) return false
  const kinds = kind ? [kind] : Object.keys(FIELDS_BY_KIND)
  return entries.every(([k, v]) => kinds.some((kd) => FIELDS_BY_KIND[kd]?.[k]?.(v) === true))
}

export function isValidOp(op: unknown, kindOf?: (id: string) => string | undefined): op is BoardOp {
  if (!op || typeof op !== 'object') return false
  const o = op as Record<string, unknown>
  if (!isRev(o.rev)) return false
  switch (o.op) {
    case 'create':
      return isValidEntity(o.entity)
    case 'patch':
      return isId(o.id) && isValidPatch(o.fields, kindOf?.(o.id as string))
    case 'delete':
      return isId(o.id)
    default:
      return false
  }
}

export function validateOps(input: unknown, kindOf?: (id: string) => string | undefined): BoardOp[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_OPS_PER_BATCH) return null
  for (const op of input) if (!isValidOp(op, kindOf)) return null
  return input as BoardOp[]
}

import { GRID_SIZE } from '@/diagram/grid'

/** Keep labels slightly off the endpoints / markers. */
export const LABEL_T_MIN = 0.08
export const LABEL_T_MAX = 0.92
export const LABEL_T_DEFAULT = 0.5

/** Max gap between the stroke and the nearest label edge (1 grid). */
export const LABEL_EDGE_GAP_MAX = GRID_SIZE

function clampLabelT(t: number): number {
  return Math.min(LABEL_T_MAX, Math.max(LABEL_T_MIN, t))
}

/**
 * Clamp center offset so the nearest label edge stays within
 * `LABEL_EDGE_GAP_MAX` of the stroke. Steps are 1px.
 * `halfExtent` = distance from label center to its edge along the path normal.
 */
export function clampLabelOffset(offset: number, halfExtent = 0): number {
  if (!Number.isFinite(offset)) return 0
  const max = Math.max(0, halfExtent) + LABEL_EDGE_GAP_MAX
  const stepped = Math.round(offset) // 1px steps
  return Math.min(max, Math.max(-max, stepped))
}

function makePathEl(d: string): SVGPathElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  el.setAttribute('d', d)
  return el
}

function tangentAt(el: SVGPathElement, len: number, t: number): { x: number; y: number } {
  const at = clampLabelT(t) * len
  const eps = Math.min(4, len * 0.01)
  const a = el.getPointAtLength(Math.max(0, at - eps))
  const b = el.getPointAtLength(Math.min(len, at + eps))
  let tx = b.x - a.x
  let ty = b.y - a.y
  const mag = Math.hypot(tx, ty) || 1
  return { x: tx / mag, y: ty / mag }
}

/** Half-size of an axis-aligned label box projected onto a unit normal. */
export function labelHalfExtentOnNormal(
  halfW: number,
  halfH: number,
  normalX: number,
  normalY: number,
): number {
  return Math.abs(normalX) * halfW + Math.abs(normalY) * halfH
}

/** Unit left-hand normal of the path at t. */
export function pathNormalAt(d: string, t: number): { x: number; y: number } {
  const el = makePathEl(d)
  const len = el.getTotalLength()
  if (len <= 0) return { x: 0, y: 1 }
  const tan = tangentAt(el, len, clampLabelT(t))
  return { x: -tan.y, y: tan.x }
}

/** Point on an SVG path at normalized distance t ∈ [0, 1]. */
export function pointAtPathT(d: string, t: number): { x: number; y: number } {
  const el = makePathEl(d)
  const len = el.getTotalLength()
  if (len <= 0) return { x: 0, y: 0 }
  const p = el.getPointAtLength(clampLabelT(t) * len)
  return { x: p.x, y: p.y }
}

/**
 * Anchor on the path at t, shifted by a signed perpendicular offset
 * (positive = left of travel direction).
 */
export function labelPointAt(
  d: string,
  t: number,
  offset = 0,
  halfExtent = 0,
): { x: number; y: number } {
  const el = makePathEl(d)
  const len = el.getTotalLength()
  if (len <= 0) return { x: 0, y: 0 }
  const clampedT = clampLabelT(t)
  const p = el.getPointAtLength(clampedT * len)
  const off = clampLabelOffset(offset, halfExtent)
  if (Math.abs(off) < 0.01) return { x: p.x, y: p.y }
  const tan = tangentAt(el, len, clampedT)
  return { x: p.x - tan.y * off, y: p.y + tan.x * off }
}

export type PathProjection = {
  t: number
  /** Signed center distance from the stroke along the path normal. */
  offset: number
}

/**
 * Project a flow-space point onto the path: nearest t + perpendicular offset.
 * Offset is clamped so the label edge stays at most 1 grid from the stroke.
 */
export function projectPointToPath(
  d: string,
  x: number,
  y: number,
  halfExtent = 0,
): PathProjection {
  const el = makePathEl(d)
  const len = el.getTotalLength()
  if (len <= 0) return { t: LABEL_T_DEFAULT, offset: 0 }

  const steps = Math.max(48, Math.ceil(len / 3))
  let bestT = LABEL_T_DEFAULT
  let bestD = Infinity
  let bestP = { x: 0, y: 0 }

  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const p = el.getPointAtLength(t * len)
    const dist = (p.x - x) ** 2 + (p.y - y) ** 2
    if (dist < bestD) {
      bestD = dist
      bestT = t
      bestP = { x: p.x, y: p.y }
    }
  }

  const span = 1 / steps
  const lo = Math.max(0, bestT - span)
  const hi = Math.min(1, bestT + span)
  const refine = 12
  for (let i = 0; i <= refine; i++) {
    const t = lo + ((hi - lo) * i) / refine
    const p = el.getPointAtLength(t * len)
    const dist = (p.x - x) ** 2 + (p.y - y) ** 2
    if (dist < bestD) {
      bestD = dist
      bestT = t
      bestP = { x: p.x, y: p.y }
    }
  }

  const t = clampLabelT(bestT)
  const tan = tangentAt(el, len, t)
  const raw = (x - bestP.x) * -tan.y + (y - bestP.y) * tan.x
  return { t, offset: clampLabelOffset(raw, halfExtent) }
}

/**
 * Snap a flow-space point onto the path; returns normalized t along the stroke.
 */
export function snapPointToPathT(d: string, x: number, y: number): number {
  return projectPointToPath(d, x, y).t
}

export function resolveLabelT(stored: number | undefined): number {
  if (typeof stored === 'number' && Number.isFinite(stored)) {
    return clampLabelT(stored)
  }
  return LABEL_T_DEFAULT
}

export function resolveLabelOffset(
  stored: number | undefined,
  halfExtent = 0,
): number {
  if (typeof stored === 'number' && Number.isFinite(stored)) {
    return clampLabelOffset(stored, halfExtent)
  }
  return 0
}

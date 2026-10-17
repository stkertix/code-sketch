/** Keep labels slightly off the endpoints / markers. */
export const LABEL_T_MIN = 0.08
export const LABEL_T_MAX = 0.92
export const LABEL_T_DEFAULT = 0.5

function clampLabelT(t: number): number {
  return Math.min(LABEL_T_MAX, Math.max(LABEL_T_MIN, t))
}

function makePathEl(d: string): SVGPathElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  el.setAttribute('d', d)
  return el
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
 * Snap a flow-space point onto the path; returns normalized t along the stroke.
 */
export function snapPointToPathT(d: string, x: number, y: number): number {
  const el = makePathEl(d)
  const len = el.getTotalLength()
  if (len <= 0) return LABEL_T_DEFAULT

  const steps = Math.max(48, Math.ceil(len / 3))
  let bestT = LABEL_T_DEFAULT
  let bestD = Infinity

  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const p = el.getPointAtLength(t * len)
    const dist = (p.x - x) ** 2 + (p.y - y) ** 2
    if (dist < bestD) {
      bestD = dist
      bestT = t
    }
  }

  // Local refine around the coarse hit
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
    }
  }

  return clampLabelT(bestT)
}

export function resolveLabelT(stored: number | undefined): number {
  if (typeof stored === 'number' && Number.isFinite(stored)) {
    return clampLabelT(stored)
  }
  return LABEL_T_DEFAULT
}

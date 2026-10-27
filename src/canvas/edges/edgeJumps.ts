import type { Pt } from '@/canvas/edges/routing'

/** Semicircle hop radius at crossings (px). */
export const HOP_RADIUS = 6

const END_EPS = 0.5

type Seg = { a: Pt; b: Pt; horizontal: boolean }

export type Hop = {
  /** Index into the polyline segment list (point i → i+1). */
  segIndex: number
  x: number
  y: number
}

function isHorizontal(a: Pt, b: Pt): boolean {
  return Math.abs(a.y - b.y) <= Math.abs(a.x - b.x)
}

function buildSegments(points: Pt[]): Seg[] {
  const segs: Seg[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (Math.hypot(b.x - a.x, b.y - a.y) < END_EPS) continue
    segs.push({ a, b, horizontal: isHorizontal(a, b) })
  }
  return segs
}

/** Proper crossing of a horizontal and a vertical segment (not T-joins). */
function intersectHV(h: Seg, v: Seg): Pt | null {
  const y = h.a.y
  const x = v.a.x
  const hMinX = Math.min(h.a.x, h.b.x)
  const hMaxX = Math.max(h.a.x, h.b.x)
  const vMinY = Math.min(v.a.y, v.b.y)
  const vMaxY = Math.max(v.a.y, v.b.y)
  if (x <= hMinX + END_EPS || x >= hMaxX - END_EPS) return null
  if (y <= vMinY + END_EPS || y >= vMaxY - END_EPS) return null
  return { x, y }
}

/**
 * Places where this edge's horizontal segments cross other edges' vertical
 * segments. Hops are drawn on the horizontal edge (classic convention).
 */
export function findHorizontalHops(myPoints: Pt[], others: Pt[][]): Hop[] {
  // Map segment list index → original polyline index (skip degenerate segs)
  const mine: Array<Seg & { segIndex: number }> = []
  for (let i = 0; i < myPoints.length - 1; i++) {
    const a = myPoints[i]
    const b = myPoints[i + 1]
    if (Math.hypot(b.x - a.x, b.y - a.y) < END_EPS) continue
    mine.push({ a, b, horizontal: isHorizontal(a, b), segIndex: i })
  }

  const hops: Hop[] = []
  for (const seg of mine) {
    if (!seg.horizontal) continue
    for (const other of others) {
      for (const o of buildSegments(other)) {
        if (o.horizontal) continue
        const hit = intersectHV(seg, o)
        if (!hit) continue
        hops.push({ segIndex: seg.segIndex, x: hit.x, y: hit.y })
      }
    }
  }

  hops.sort((a, b) => a.segIndex - b.segIndex || a.x - b.x)
  const deduped: Hop[] = []
  for (const h of hops) {
    const prev = deduped[deduped.length - 1]
    if (
      prev &&
      prev.segIndex === h.segIndex &&
      Math.abs(prev.x - h.x) < HOP_RADIUS &&
      Math.abs(prev.y - h.y) < HOP_RADIUS
    ) {
      continue
    }
    deduped.push(h)
  }
  return deduped
}

function appendHopArc(
  parts: string[],
  from: Pt,
  hop: Pt,
  toX: number,
  r: number,
): Pt {
  const dir = Math.sign(toX - from.x) || 1
  const y = hop.y
  const beforeX = hop.x - dir * r
  const afterX = hop.x + dir * r

  if ((beforeX - from.x) * dir < END_EPS) return from
  if ((toX - afterX) * dir < END_EPS) return from

  parts.push(`L ${beforeX} ${y}`)
  // Upward semicircle (negative Y in screen space)
  if (dir > 0) {
    parts.push(`A ${r} ${r} 0 0 0 ${afterX} ${y}`)
  } else {
    parts.push(`A ${r} ${r} 0 0 1 ${afterX} ${y}`)
  }
  return { x: afterX, y }
}

function emitStraightWithHops(
  parts: string[],
  from: Pt,
  to: Pt,
  hops: Hop[],
  r: number,
): void {
  const horizontal = Math.abs(from.y - to.y) <= Math.abs(from.x - to.x)
  if (!horizontal || hops.length === 0) {
    parts.push(`L ${to.x} ${to.y}`)
    return
  }

  const dir = Math.sign(to.x - from.x) || 1
  const usable = hops
    .filter((h) => {
      const along = (h.x - from.x) * dir
      const rem = (to.x - h.x) * dir
      return along >= r * 1.25 && rem >= r * 1.25
    })
    .sort((a, b) => (a.x - b.x) * dir)

  let cursor = from
  for (const h of usable) {
    cursor = appendHopArc(parts, cursor, h, to.x, r)
  }
  parts.push(`L ${to.x} ${to.y}`)
}

/**
 * SVG path from orthogonal waypoints, with rounded corners and semicircle
 * hops on horizontal segments that cross other edges.
 */
export function pointsToPathWithHops(
  points: Pt[],
  borderRadius: number,
  hops: Hop[],
  hopRadius = HOP_RADIUS,
): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`

  const hopsBySeg = new Map<number, Hop[]>()
  for (const h of hops) {
    const list = hopsBySeg.get(h.segIndex) ?? []
    list.push(h)
    hopsBySeg.set(h.segIndex, list)
  }

  type Corner = { p1: Pt; p2: Pt }
  const corners: Array<Corner | null> = points.map(() => null)

  if (borderRadius > 0 && points.length > 2) {
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1]
      const cur = points[i]
      const next = points[i + 1]
      const dx1 = cur.x - prev.x
      const dy1 = cur.y - prev.y
      const dx2 = next.x - cur.x
      const dy2 = next.y - cur.y
      const len1 = Math.hypot(dx1, dy1) || 1
      const len2 = Math.hypot(dx2, dy2) || 1
      const rr = Math.min(borderRadius, len1 / 2, len2 / 2)
      corners[i] = {
        p1: { x: cur.x - (dx1 / len1) * rr, y: cur.y - (dy1 / len1) * rr },
        p2: { x: cur.x + (dx2 / len2) * rr, y: cur.y + (dy2 / len2) * rr },
      }
    }
  }

  const parts: string[] = [`M ${points[0].x} ${points[0].y}`]

  for (let i = 0; i < points.length - 1; i++) {
    const from = i === 0 ? points[0] : (corners[i]?.p2 ?? points[i])
    const to =
      i === points.length - 2
        ? points[points.length - 1]
        : (corners[i + 1]?.p1 ?? points[i + 1])

    emitStraightWithHops(parts, from, to, hopsBySeg.get(i) ?? [], hopRadius)

    if (corners[i + 1]) {
      const c = corners[i + 1]!
      const cur = points[i + 1]
      parts.push(`Q ${cur.x} ${cur.y} ${c.p2.x} ${c.p2.y}`)
    }
  }

  return parts.join(' ')
}

/** Convenience: detect hops against other polylines and build the path. */
export function buildHoppedPath(
  points: Pt[],
  borderRadius: number,
  others: Pt[][],
  hopRadius = HOP_RADIUS,
): string {
  const hops = findHorizontalHops(points, others)
  if (hops.length === 0) {
    // Fall back handled by caller via pointsToPath; still produce hopped-capable path
    return pointsToPathWithHops(points, borderRadius, hops, hopRadius)
  }
  return pointsToPathWithHops(points, borderRadius, hops, hopRadius)
}

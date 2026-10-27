import { Position, type Edge, type Node } from '@xyflow/react'
import type { CSSProperties } from 'react'
import { GRID_SIZE, snapToGrid } from '@/diagram/grid'
import {
  dedicatedHandleId,
  isGridHandle,
  sideFromHandle,
  type HandleSide,
} from '@/diagram/handles'

// Re-export domain handle helpers so canvas consumers can import from one place.
export {
  dedicatedHandleId,
  gridHandleId,
  HANDLE_SIDES,
  isGridHandle,
  pickHandleSides,
  positionFromSide,
  sideFromHandle,
  toDedicatedHandle,
  withDedicatedHandles,
  type HandleSide,
} from '@/diagram/handles'

/** Spacing between parallel orthogonal corridors. */
export const PAIR_LANE_GAP = GRID_SIZE * 2

/** Short leave-node stub before the first bend. */
const STUB = GRID_SIZE

/**
 * Mid-path gap between a corridor and any node face (1 grid).
 * Tip/handle attachment stays on the border; this only affects the line body.
 */
const CLEARANCE = GRID_SIZE

/** If handle axes are this close, treat as aligned (nearly straight). */
const ALIGN_EPS = GRID_SIZE

const HANDLE_DIR: Record<Position, { x: number; y: number }> = {
  [Position.Left]: { x: -1, y: 0 },
  [Position.Right]: { x: 1, y: 0 },
  [Position.Top]: { x: 0, y: -1 },
  [Position.Bottom]: { x: 0, y: 1 },
}

function nodeSize(node: Node): { w: number; h: number } {
  const w = node.width ?? node.measured?.width ?? 160
  const h = node.height ?? node.measured?.height ?? 80
  return { w, h }
}

function nodeCenter(node: Node): { x: number; y: number } {
  const { w, h } = nodeSize(node)
  return { x: node.position.x + w / 2, y: node.position.y + h / 2 }
}

function otherNodeId(edge: Edge, nodeId: string): string {
  return edge.source === nodeId ? edge.target : edge.source
}

function edgesOnSide(edges: Edge[], nodeId: string, side: HandleSide): Edge[] {
  return edges.filter((e) => {
    if (e.source === nodeId && sideFromHandle(e.sourceHandle) === side) return true
    if (e.target === nodeId && sideFromHandle(e.targetHandle) === side) return true
    return false
  })
}

function sortEdgesOnSide(
  edges: Edge[],
  nodes: Node[],
  nodeId: string,
  side: HandleSide,
): Edge[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const alongX = side === 'top' || side === 'bottom'

  return edges.slice().sort((a, b) => {
    const na = nodeById.get(otherNodeId(a, nodeId))
    const nb = nodeById.get(otherNodeId(b, nodeId))
    const ca = na ? nodeCenter(na) : { x: 0, y: 0 }
    const cb = nb ? nodeCenter(nb) : { x: 0, y: 0 }
    const da = alongX ? ca.x : ca.y
    const db = alongX ? cb.x : cb.y
    if (da !== db) return da - db
    return a.id.localeCompare(b.id)
  })
}

export type SidePort = {
  edgeId: string
  handleId: string
  /** Pixel offset from the start of the side (top for L/R, left for T/B), on-grid. */
  offsetPx: number
}

/**
 * Pixel offsets along a side for connector dots on every grid step
 * (1-grid margin from each corner).
 */
export function gridPortOffsets(sideLength: number): number[] {
  const margin = GRID_SIZE
  if (sideLength <= margin * 2) {
    return [Math.min(sideLength - margin, Math.max(margin, snapToGrid(sideLength / 2)))]
  }
  const offsets: number[] = []
  for (let o = margin; o <= sideLength - margin + 0.5; o += GRID_SIZE) {
    offsets.push(o)
  }
  return offsets
}

function handleOnNodeSide(edge: Edge, nodeId: string, side: HandleSide): string | null | undefined {
  if (edge.source === nodeId && sideFromHandle(edge.sourceHandle) === side) {
    return edge.sourceHandle
  }
  if (edge.target === nodeId && sideFromHandle(edge.targetHandle) === side) {
    return edge.targetHandle
  }
  return null
}

/**
 * Place dedicated side ports so consecutive markers are exactly one grid apart,
 * centered on the side when they fit (clamped into the side margins otherwise).
 *
 * Edges already pinned to a grid handle (`side:gN`) are skipped — those use the
 * permanent grid connector dots instead.
 *
 * When `overlap` is true (flowchart), every port shares the side center so
 * converging edges like Start→Ready and Wait→Ready may stack on one point.
 */
export function getSidePortLayout(
  edges: Edge[],
  nodes: Node[],
  nodeId: string,
  side: HandleSide,
  overlap = false,
): SidePort[] {
  const onSide = edgesOnSide(edges, nodeId, side).filter(
    (e) => !isGridHandle(handleOnNodeSide(e, nodeId, side)),
  )
  const group = sortEdgesOnSide(onSide, nodes, nodeId, side)
  if (group.length === 0) return []

  const node = nodes.find((n) => n.id === nodeId)
  const { w, h } = node ? nodeSize(node) : { w: 160, h: 80 }
  const sideLength = side === 'left' || side === 'right' ? h : w
  const margin = GRID_SIZE
  const center = snapToGrid(sideLength / 2)

  if (overlap) {
    const offsetPx = Math.min(sideLength - margin, Math.max(margin, center))
    return group.map((e) => ({
      edgeId: e.id,
      handleId: dedicatedHandleId(side, e.id),
      offsetPx,
    }))
  }

  const gap = GRID_SIZE // one grid between markers
  const count = group.length

  // Cluster span: (n-1) gaps between n ports
  const clusterSpan = (count - 1) * gap
  const minStart = margin
  const maxStart = Math.max(minStart, sideLength - margin - clusterSpan)
  let start = snapToGrid((sideLength - clusterSpan) / 2)
  start = Math.min(maxStart, Math.max(minStart, start))

  return group.map((e, index) => {
    const raw = start + index * gap
    const offsetPx = Math.min(
      sideLength - margin,
      Math.max(margin, snapToGrid(raw)),
    )
    return {
      edgeId: e.id,
      handleId: dedicatedHandleId(side, e.id),
      offsetPx,
    }
  })
}

/** Position a port handle using on-grid pixel offsets (not %). */
export function handleStyleForSide(side: HandleSide, offsetPx: number): CSSProperties {
  switch (side) {
    case 'left':
      return { top: offsetPx, left: 0, right: 'auto', bottom: 'auto' }
    case 'right':
      return { top: offsetPx, right: 0, left: 'auto', bottom: 'auto' }
    case 'top':
      return { left: offsetPx, top: 0, right: 'auto', bottom: 'auto' }
    case 'bottom':
      return { left: offsetPx, bottom: 0, top: 'auto', right: 'auto' }
  }
}

export type SideNesting = { rank: number; count: number }

const EMPTY_NEST: SideNesting = { rank: 0, count: 1 }

/** Rank among all edges attached to a node side (fan-out / fan-in). */
export function getSideNesting(
  edges: Edge[],
  nodes: Node[],
  edgeId: string,
  nodeId: string,
  side: HandleSide | null,
): SideNesting {
  if (!side) return EMPTY_NEST
  const group = sortEdgesOnSide(edgesOnSide(edges, nodeId, side), nodes, nodeId, side)
  if (group.length <= 1) return EMPTY_NEST
  const rank = group.findIndex((e) => e.id === edgeId)
  if (rank < 0) return EMPTY_NEST
  return { rank, count: group.length }
}

/** Outer-first nest index: rank 0 (top/left-most) → largest corridor. */
function outerNest(nesting: SideNesting): number {
  if (nesting.count <= 1) return 0
  return nesting.count - 1 - nesting.rank
}

/** Signed lane offset for straight / bezier. */
export function sideLaneOffset(nesting: SideNesting, gap = PAIR_LANE_GAP): number {
  if (nesting.count <= 1) return 0
  return (nesting.rank - (nesting.count - 1) / 2) * gap
}

export function offsetEndpoints(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  offset: number,
): { sourceX: number; sourceY: number; targetX: number; targetY: number } {
  if (offset === 0) return { sourceX, sourceY, targetX, targetY }
  const dx = targetX - sourceX
  const dy = targetY - sourceY
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  return {
    sourceX: sourceX + nx * offset,
    sourceY: sourceY + ny * offset,
    targetX: targetX + nx * offset,
    targetY: targetY + ny * offset,
  }
}

export type Pt = { x: number; y: number }

function isH(p: Position): boolean {
  return p === Position.Left || p === Position.Right
}

function isV(p: Position): boolean {
  return p === Position.Top || p === Position.Bottom
}

/** Snap corridor coordinates; keep handle-aligned axes exact for orthogonality. */
function snapAxis(value: number): number {
  return snapToGrid(value)
}

/** Handles face each other across a gap (classic left↔right / top↔bottom link). */
function handlesFaceEachOther(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourcePosition: Position,
  targetPosition: Position,
): boolean {
  if (
    sourcePosition === Position.Right &&
    targetPosition === Position.Left &&
    sourceX <= targetX
  ) {
    return true
  }
  if (
    sourcePosition === Position.Left &&
    targetPosition === Position.Right &&
    sourceX >= targetX
  ) {
    return true
  }
  if (
    sourcePosition === Position.Bottom &&
    targetPosition === Position.Top &&
    sourceY <= targetY
  ) {
    return true
  }
  if (
    sourcePosition === Position.Top &&
    targetPosition === Position.Bottom &&
    sourceY >= targetY
  ) {
    return true
  }
  return false
}

/**
 * Prefer few bends: facing edges use a single mid corridor (Z), not dual exit stubs.
 * Nested edges only offset that corridor — never stack extra S-turns.
 */
function sideAwareWaypoints(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourcePosition: Position,
  targetPosition: Position,
  sourceNest: SideNesting,
  targetNest: SideNesting,
  gap: number,
  stub: number,
): Pt[] {
  const sOut = outerNest(sourceNest)
  const tOut = outerNest(targetNest)
  const sDir = HANDLE_DIR[sourcePosition]
  const tDir = HANDLE_DIR[targetPosition]
  const nest = sourceNest.count >= targetNest.count ? sourceNest : targetNest
  const lane = sideLaneOffset(nest, gap)
  const facing = handlesFaceEachOther(
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  )

  // ── Horizontal handles (left / right) ──
  if (isH(sourcePosition) && isH(targetPosition)) {
    // Nearly level + facing → almost straight (at most a tiny stub)
    if (facing && Math.abs(sourceY - targetY) <= ALIGN_EPS && nest.count <= 1) {
      return simplifyOrth([
        { x: sourceX, y: sourceY },
        { x: targetX, y: sourceY },
        { x: targetX, y: targetY },
      ])
    }

    if (facing) {
      // Single vertical run in the gap — keep CLEARANCE off both node sides.
      const lo = Math.min(sourceX, targetX) + CLEARANCE
      const hi = Math.max(sourceX, targetX) - CLEARANCE
      let midX = (sourceX + targetX) / 2 + lane
      if (lo < hi) midX = Math.max(lo, Math.min(hi, midX))
      else midX = (sourceX + targetX) / 2
      midX = snapAxis(midX)
      return simplifyOrth([
        { x: sourceX, y: sourceY },
        { x: midX, y: sourceY },
        { x: midX, y: targetY },
        { x: targetX, y: targetY },
      ])
    }

    // Same-side / pointing away: shallow U, one shared midY
    const sExitX = snapAxis(sourceX + sDir.x * (stub + sOut * gap))
    const tExitX = snapAxis(targetX + tDir.x * (stub + tOut * gap))
    const outward = sDir.x > 0 || tDir.x > 0 ? 1 : -1
    const midY = snapAxis(
      (outward > 0
        ? Math.max(sourceY, targetY)
        : Math.min(sourceY, targetY)) +
        outward * (stub + Math.max(sOut, tOut) * gap) +
        lane,
    )
    return simplifyOrth([
      { x: sourceX, y: sourceY },
      { x: sExitX, y: sourceY },
      { x: sExitX, y: midY },
      { x: tExitX, y: midY },
      { x: tExitX, y: targetY },
      { x: targetX, y: targetY },
    ])
  }

  // ── Vertical handles (top / bottom) ──
  if (isV(sourcePosition) && isV(targetPosition)) {
    if (facing && Math.abs(sourceX - targetX) <= ALIGN_EPS && nest.count <= 1) {
      return simplifyOrth([
        { x: sourceX, y: sourceY },
        { x: sourceX, y: targetY },
        { x: targetX, y: targetY },
      ])
    }

    if (facing) {
      const lo = Math.min(sourceY, targetY) + CLEARANCE
      const hi = Math.max(sourceY, targetY) - CLEARANCE
      let midY = (sourceY + targetY) / 2 + lane
      if (lo < hi) midY = Math.max(lo, Math.min(hi, midY))
      else midY = (sourceY + targetY) / 2
      midY = snapAxis(midY)
      return simplifyOrth([
        { x: sourceX, y: sourceY },
        { x: sourceX, y: midY },
        { x: targetX, y: midY },
        { x: targetX, y: targetY },
      ])
    }

    const sExitY = snapAxis(sourceY + sDir.y * (stub + sOut * gap))
    const tExitY = snapAxis(targetY + tDir.y * (stub + tOut * gap))
    const outward = sDir.y > 0 || tDir.y > 0 ? 1 : -1
    const midX = snapAxis(
      (outward > 0
        ? Math.max(sourceX, targetX)
        : Math.min(sourceX, targetX)) +
        outward * (stub + Math.max(sOut, tOut) * gap) +
        lane,
    )
    return simplifyOrth([
      { x: sourceX, y: sourceY },
      { x: sourceX, y: sExitY },
      { x: midX, y: sExitY },
      { x: midX, y: tExitY },
      { x: targetX, y: tExitY },
      { x: targetX, y: targetY },
    ])
  }

  // ── Corner (H→V or V→H): plain L, optional short stub only when nested ──
  if (isH(sourcePosition) && isV(targetPosition)) {
    const exitX =
      nest.count > 1
        ? snapAxis(sourceX + sDir.x * (stub + sOut * gap))
        : snapAxis(sourceX + sDir.x * stub)
    // L through (exitX, targetY) — one bend, no extra entry jog
    return simplifyOrth([
      { x: sourceX, y: sourceY },
      { x: exitX, y: sourceY },
      { x: exitX, y: targetY },
      { x: targetX, y: targetY },
    ])
  }

  if (isV(sourcePosition) && isH(targetPosition)) {
    const exitY =
      nest.count > 1
        ? snapAxis(sourceY + sDir.y * (stub + sOut * gap))
        : snapAxis(sourceY + sDir.y * stub)
    return simplifyOrth([
      { x: sourceX, y: sourceY },
      { x: sourceX, y: exitY },
      { x: targetX, y: exitY },
      { x: targetX, y: targetY },
    ])
  }

  return [
    { x: sourceX, y: sourceY },
    { x: targetX, y: targetY },
  ]
}

/**
 * Collapse collinear points and sub-grid stair jogs so rounded corners
 * don't turn a simple Z into a wavy S.
 */
export function simplifyOrth(points: Pt[], epsilon = GRID_SIZE / 2): Pt[] {
  if (points.length < 2) return points

  // Drop zero-length segments
  let pts: Pt[] = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const prev = pts[pts.length - 1]
    const cur = points[i]
    if (Math.hypot(cur.x - prev.x, cur.y - prev.y) >= 0.5) pts.push(cur)
  }

  // Merge tiny axis jogs: A→B→C where AB is a sub-grid stub
  const merged: Pt[] = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const cur = pts[i]
    if (merged.length >= 2) {
      const a = merged[merged.length - 2]
      const b = merged[merged.length - 1]
      const abH = Math.abs(a.y - b.y) < 0.5
      const abV = Math.abs(a.x - b.x) < 0.5
      const bcH = Math.abs(b.y - cur.y) < 0.5
      const bcV = Math.abs(b.x - cur.x) < 0.5
      if (abH && bcV && Math.abs(a.x - b.x) < epsilon) {
        merged[merged.length - 1] = { x: cur.x, y: a.y }
        if (Math.hypot(cur.x - merged[merged.length - 1].x, cur.y - merged[merged.length - 1].y) >= 0.5) {
          merged.push(cur)
        }
        continue
      }
      if (abV && bcH && Math.abs(a.y - b.y) < epsilon) {
        merged[merged.length - 1] = { x: a.x, y: cur.y }
        if (Math.hypot(cur.x - merged[merged.length - 1].x, cur.y - merged[merged.length - 1].y) >= 0.5) {
          merged.push(cur)
        }
        continue
      }
    }
    merged.push(cur)
  }

  // Drop middle points that sit on a straight H or V run
  if (merged.length < 3) return merged
  const out: Pt[] = [merged[0]]
  for (let i = 1; i < merged.length - 1; i++) {
    const a = out[out.length - 1]
    const b = merged[i]
    const c = merged[i + 1]
    const colH = Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - c.y) < 0.5
    const colV = Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - c.x) < 0.5
    if (colH || colV) continue
    out.push(b)
  }
  out.push(merged[merged.length - 1])
  return out
}

export function pointsToPath(points: Pt[], borderRadius: number): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  if (borderRadius <= 0 || points.length === 2) {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  }

  const r = borderRadius
  let d = `M ${points[0].x} ${points[0].y}`

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
    const rr = Math.min(r, len1 / 2, len2 / 2)
    const p1 = { x: cur.x - (dx1 / len1) * rr, y: cur.y - (dy1 / len1) * rr }
    const p2 = { x: cur.x + (dx2 / len2) * rr, y: cur.y + (dy2 / len2) * rr }
    d += ` L ${p1.x} ${p1.y} Q ${cur.x} ${cur.y} ${p2.x} ${p2.y}`
  }

  const last = points[points.length - 1]
  d += ` L ${last.x} ${last.y}`
  return d
}

function pathLabelCenter(points: Pt[]): { x: number; y: number } {
  if (points.length < 2) return points[0] ?? { x: 0, y: 0 }
  let best = 0
  let bi = 0
  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y)
    if (len > best) {
      best = len
      bi = i
    }
  }
  return {
    x: (points[bi].x + points[bi + 1].x) / 2,
    y: (points[bi].y + points[bi + 1].y) / 2,
  }
}

/** Axis-aligned obstacle in flow coordinates (other nodes). */
export type ObstacleRect = {
  x: number
  y: number
  width: number
  height: number
}

const OBSTACLE_PAD = CLEARANCE

function inflate(r: ObstacleRect, pad: number): ObstacleRect {
  return {
    x: r.x - pad,
    y: r.y - pad,
    width: r.width + pad * 2,
    height: r.height + pad * 2,
  }
}

/**
 * True if an orthogonal segment overlaps a rect.
 * `exclusive` — open bounds so a corridor exactly CLEARANCE outside a node
 * (on the inflated pad edge) is allowed, not treated as sticking.
 */
function segmentHitsRect(
  a: Pt,
  b: Pt,
  r: ObstacleRect,
  exclusive = false,
): boolean {
  const x1 = r.x
  const y1 = r.y
  const x2 = r.x + r.width
  const y2 = r.y + r.height

  if (Math.abs(a.y - b.y) < 0.5) {
    const y = a.y
    if (exclusive ? y <= y1 || y >= y2 : y < y1 || y > y2) return false
    const lo = Math.min(a.x, b.x)
    const hi = Math.max(a.x, b.x)
    return exclusive ? hi > x1 && lo < x2 : hi >= x1 && lo <= x2
  }
  if (Math.abs(a.x - b.x) < 0.5) {
    const x = a.x
    if (exclusive ? x <= x1 || x >= x2 : x < x1 || x > x2) return false
    const lo = Math.min(a.y, b.y)
    const hi = Math.max(a.y, b.y)
    return exclusive ? hi > y1 && lo < y2 : hi >= y1 && lo <= y2
  }
  return false
}

/** True if segment crosses the node body (inset so handle-edge approaches are ok). */
function segmentHitsInterior(a: Pt, b: Pt, r: ObstacleRect, inset = 4): boolean {
  if (r.width <= inset * 2 || r.height <= inset * 2) return false
  return segmentHitsRect(a, b, {
    x: r.x + inset,
    y: r.y + inset,
    width: r.width - inset * 2,
    height: r.height - inset * 2,
  })
}

/**
 * Flush run along a node side (middle segments only) — the “menempel” case.
 * Distance must be >= pad (1 grid); closer than that scores as a hit.
 */
function sideFlushHits(
  points: Pt[],
  rect: ObstacleRect,
  pad: number,
): number {
  if (points.length < 3) return 0
  let hits = 0
  // Skip leave stub (0) and enter stub (last)
  for (let i = 1; i < points.length - 2; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (Math.abs(a.y - b.y) < 0.5) {
      // horizontal — closer than `pad` to top/bottom face
      const dTop = Math.abs(a.y - rect.y)
      const dBot = Math.abs(a.y - (rect.y + rect.height))
      if (dTop < pad || dBot < pad) {
        const lo = Math.min(a.x, b.x)
        const hi = Math.max(a.x, b.x)
        if (hi > rect.x - pad && lo < rect.x + rect.width + pad) hits += 1
      }
    } else if (Math.abs(a.x - b.x) < 0.5) {
      // vertical — closer than `pad` to left/right face
      const dLeft = Math.abs(a.x - rect.x)
      const dRight = Math.abs(a.x - (rect.x + rect.width))
      if (dLeft < pad || dRight < pad) {
        const lo = Math.min(a.y, b.y)
        const hi = Math.max(a.y, b.y)
        if (hi > rect.y - pad && lo < rect.y + rect.height + pad) hits += 1
      }
    }
  }
  return hits
}

/**
 * Count crossings: other nodes (padded), endpoint interiors (through-body),
 * and flush runs along any nearby node sides.
 */
function pathObstacleHits(
  points: Pt[],
  obstacles: ObstacleRect[],
  endpoints: { source?: ObstacleRect; target?: ObstacleRect } = {},
): number {
  if (points.length < 2) return 0
  let hits = 0
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    for (const raw of obstacles) {
      // Exclusive: corridor exactly CLEARANCE outside the node is fine
      if (segmentHitsRect(a, b, inflate(raw, OBSTACLE_PAD), true)) hits += 1
    }
    if (endpoints.source && segmentHitsInterior(a, b, endpoints.source)) hits += 1
    if (endpoints.target && segmentHitsInterior(a, b, endpoints.target)) hits += 1
  }
  for (const raw of obstacles) {
    hits += sideFlushHits(points, raw, CLEARANCE)
  }
  if (endpoints.source) hits += sideFlushHits(points, endpoints.source, CLEARANCE)
  if (endpoints.target) hits += sideFlushHits(points, endpoints.target, CLEARANCE)
  return hits
}

function pathLength(points: Pt[]): number {
  let len = 0
  for (let i = 0; i < points.length - 1; i++) {
    len += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y)
  }
  return len
}

/**
 * Penalize a long final segment that slides along the node face instead of
 * approaching along the handle normal (e.g. vertical run into a left handle).
 */
function approachHugPenalty(
  points: Pt[],
  sourcePosition: Position,
  targetPosition: Position,
): number {
  if (points.length < 2) return 0
  let penalty = 0
  const a = points[points.length - 2]
  const b = points[points.length - 1]
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  if (len > CLEARANCE) {
    const vertical = Math.abs(a.x - b.x) < 0.5
    const horizontal = Math.abs(a.y - b.y) < 0.5
    if (isH(targetPosition) && vertical) penalty += 500_000
    if (isV(targetPosition) && horizontal) penalty += 500_000
  }
  const a0 = points[0]
  const b0 = points[1]
  const len0 = Math.hypot(b0.x - a0.x, b0.y - a0.y)
  if (len0 > CLEARANCE) {
    const vertical = Math.abs(a0.x - b0.x) < 0.5
    const horizontal = Math.abs(a0.y - b0.y) < 0.5
    if (isH(sourcePosition) && vertical) penalty += 500_000
    if (isV(sourcePosition) && horizontal) penalty += 500_000
  }
  return penalty
}

function scorePath(
  points: Pt[],
  obstacles: ObstacleRect[],
  endpoints: { source?: ObstacleRect; target?: ObstacleRect },
  sourcePosition: Position,
  targetPosition: Position,
): number {
  const hits = pathObstacleHits(points, obstacles, endpoints)
  const hug = approachHugPenalty(points, sourcePosition, targetPosition)
  const bends = Math.max(0, points.length - 2)
  return hits * 1_000_000 + hug + bends * 1_000 + pathLength(points)
}

function pickBestPath(
  candidates: Pt[][],
  obstacles: ObstacleRect[],
  endpoints: { source?: ObstacleRect; target?: ObstacleRect },
  sourcePosition: Position,
  targetPosition: Position,
): Pt[] {
  let best: Pt[] | null = null
  let bestScore = Infinity
  for (const raw of candidates) {
    if (!raw || raw.length < 2) continue
    const points = simplifyOrth(raw)
    const score = scorePath(points, obstacles, endpoints, sourcePosition, targetPosition)
    if (score < bestScore) {
      bestScore = score
      best = points
    }
  }
  return best ?? candidates[0] ?? []
}

function unionRect(rects: ObstacleRect[]): ObstacleRect | null {
  if (rects.length === 0) return null
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  for (const r of rects) {
    x1 = Math.min(x1, r.x)
    y1 = Math.min(y1, r.y)
    x2 = Math.max(x2, r.x + r.width)
    y2 = Math.max(y2, r.y + r.height)
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}

/** Obstacles whose X span overlaps the source↔target corridor. */
function obstaclesInXSpan(
  obstacles: ObstacleRect[],
  xA: number,
  xB: number,
): ObstacleRect[] {
  const lo = Math.min(xA, xB)
  const hi = Math.max(xA, xB)
  return obstacles.filter((o) => o.x < hi && o.x + o.width > lo)
}

function obstaclesInYSpan(
  obstacles: ObstacleRect[],
  yA: number,
  yB: number,
): ObstacleRect[] {
  const lo = Math.min(yA, yB)
  const hi = Math.max(yA, yB)
  return obstacles.filter((o) => o.y < hi && o.y + o.height > lo)
}

/**
 * Obstacles that actually sit in the axis-aligned box between endpoints.
 * Axis-only filters wrongly include siblings beside the path (e.g. Do work
 * when routing Ready→Wait), which forces useless left/right detours.
 */
function obstaclesInEndpointBox(
  obstacles: ObstacleRect[],
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  pad = CLEARANCE,
): ObstacleRect[] {
  const x1 = Math.min(sourceX, targetX) - pad
  const x2 = Math.max(sourceX, targetX) + pad
  const y1 = Math.min(sourceY, targetY) - pad
  const y2 = Math.max(sourceY, targetY) + pad
  return obstacles.filter(
    (o) => o.x < x2 && o.x + o.width > x1 && o.y < y2 && o.y + o.height > y1,
  )
}

/**
 * Wrap around a blocking union with gates outside the block so verticals
 * don't climb back through the same nodes (the usual "through user" bug).
 */
function wrapCandidates(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourcePosition: Position,
  targetPosition: Position,
  obstacles: ObstacleRect[],
  stub: number,
  lane: number,
): Pt[][] {
  if (obstacles.length === 0) return []

  const sDir = HANDLE_DIR[sourcePosition]
  const tDir = HANDLE_DIR[targetPosition]
  const start = { x: sourceX, y: sourceY }
  const end = { x: targetX, y: targetY }
  const sExit = {
    x: snapAxis(sourceX + sDir.x * stub),
    y: snapAxis(sourceY + sDir.y * stub),
  }
  const tExit = {
    x: snapAxis(targetX + tDir.x * stub),
    y: snapAxis(targetY + tDir.y * stub),
  }

  const cands: Pt[][] = []
  // Only nodes sitting between the endpoints — not siblings beside the path
  const between = obstaclesInEndpointBox(obstacles, sourceX, sourceY, targetX, targetY)

  // ── Horizontal wrap (most ER edges): corridor above/below blocking nodes ──
  const xBlockers = obstaclesInXSpan(between, sourceX, targetX)
  const xUnion = unionRect(xBlockers.map((o) => inflate(o, OBSTACLE_PAD)))
  if (xUnion) {
    const top = snapAxis(xUnion.y - stub + lane)
    const bottom = snapAxis(xUnion.y + xUnion.height + stub + lane)
    const blockLeft = xUnion.x
    const blockRight = xUnion.x + xUnion.width

    let sGateX =
      sourceX <= targetX
        ? snapAxis(Math.min(sExit.x, blockLeft - stub))
        : snapAxis(Math.max(sExit.x, blockRight + stub))
    if (sourceX <= targetX && sGateX < sourceX) sGateX = snapAxis(sourceX)
    if (sourceX > targetX && sGateX > sourceX) sGateX = snapAxis(sourceX)

    for (const wrapY of [top, bottom]) {
      // Enter along the handle normal (short stub), never slide down the node face
      if (isH(targetPosition)) {
        cands.push([
          start,
          { x: sGateX, y: sourceY },
          { x: sGateX, y: wrapY },
          { x: tExit.x, y: wrapY },
          { x: tExit.x, y: targetY },
          end,
        ])
      } else {
        cands.push([
          start,
          { x: sGateX, y: sourceY },
          { x: sGateX, y: wrapY },
          { x: targetX, y: wrapY },
          { x: targetX, y: tExit.y },
          end,
        ])
      }
    }
  }

  // ── Vertical wrap: corridor left/right of blocking nodes ──
  const yBlockers = obstaclesInYSpan(between, sourceY, targetY)
  const yUnion = unionRect(yBlockers.map((o) => inflate(o, OBSTACLE_PAD)))
  if (yUnion) {
    const left = snapAxis(yUnion.x - stub + lane)
    const right = snapAxis(yUnion.x + yUnion.width + stub + lane)
    const blockTop = yUnion.y
    const blockBottom = yUnion.y + yUnion.height

    // Gate must move toward the target — never step the wrong way first
    // (that caused Wait→Ready to dive under Wait before climbing back up).
    let sGateY =
      sourceY <= targetY
        ? snapAxis(Math.min(sExit.y, blockTop - stub))
        : snapAxis(Math.max(sExit.y, blockBottom + stub))
    if (sourceY <= targetY && sGateY < sourceY) sGateY = snapAxis(sourceY)
    if (sourceY > targetY && sGateY > sourceY) sGateY = snapAxis(sourceY)

    for (const wrapX of [left, right]) {
      if (isV(targetPosition)) {
        cands.push([
          start,
          { x: sourceX, y: sGateY },
          { x: wrapX, y: sGateY },
          { x: wrapX, y: tExit.y },
          { x: targetX, y: tExit.y },
          end,
        ])
      } else {
        // Left/right target: last move must be horizontal into the handle
        cands.push([
          start,
          { x: sourceX, y: sGateY },
          { x: wrapX, y: sGateY },
          { x: wrapX, y: targetY },
          { x: tExit.x, y: targetY },
          end,
        ])
      }
    }
  }

  // Mid corridors only in the handle-facing axis, and never on the endpoint
  // axes (those slide flush along the source/target node faces).
  for (const o of between) {
    const box = inflate(o, OBSTACLE_PAD)
    if (isH(sourcePosition) && isH(targetPosition)) {
      for (const midX of [snapAxis(box.x - stub), snapAxis(box.x + box.width + stub)]) {
        if (Math.abs(midX - sourceX) < CLEARANCE || Math.abs(midX - targetX) < CLEARANCE) {
          continue
        }
        cands.push([start, { x: midX, y: sourceY }, { x: midX, y: targetY }, end])
      }
    }
    if (isV(sourcePosition) && isV(targetPosition)) {
      for (const midY of [snapAxis(box.y - stub), snapAxis(box.y + box.height + stub)]) {
        if (Math.abs(midY - sourceY) < CLEARANCE || Math.abs(midY - targetY) < CLEARANCE) {
          continue
        }
        cands.push([start, { x: sourceX, y: midY }, { x: targetX, y: midY }, end])
      }
    }
  }

  return cands
}

/**
 * Self-loop: stay outside the node box (never cut through facing mid-corridor).
 */
function selfLoopWaypoints(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourcePosition: Position,
  targetPosition: Position,
  nest: SideNesting,
  nodeRect: ObstacleRect | undefined,
  stub: number,
  gap: number,
): Pt[] {
  const bump = stub + CLEARANCE + outerNest(nest) * gap
  const lane = sideLaneOffset(nest, gap)
  const sDir = HANDLE_DIR[sourcePosition]
  const tDir = HANDLE_DIR[targetPosition]
  const sExit: Pt = {
    x: snapAxis(sourceX + sDir.x * bump),
    y: snapAxis(sourceY + sDir.y * bump),
  }
  const tExit: Pt = {
    x: snapAxis(targetX + tDir.x * bump),
    y: snapAxis(targetY + tDir.y * bump),
  }

  const box = nodeRect ?? {
    x: Math.min(sourceX, targetX) - GRID_SIZE * 4,
    y: Math.min(sourceY, targetY) - GRID_SIZE * 4,
    width: Math.abs(targetX - sourceX) + GRID_SIZE * 8,
    height: Math.abs(targetY - sourceY) + GRID_SIZE * 8,
  }

  // Same side → U-turn along the exterior of that side
  if (sourcePosition === targetPosition) {
    if (isH(sourcePosition)) {
      const midX = sExit.x
      const preferBottom = sourcePosition === Position.Right || lane >= 0
      const loopY = snapAxis(
        preferBottom ? box.y + box.height + bump + Math.abs(lane) : box.y - bump - Math.abs(lane),
      )
      return simplifyOrth([
        { x: sourceX, y: sourceY },
        { x: midX, y: sourceY },
        { x: midX, y: loopY },
        { x: tExit.x, y: loopY },
        { x: tExit.x, y: targetY },
        { x: targetX, y: targetY },
      ])
    }
    const midY = sExit.y
    const preferRight = sourcePosition === Position.Bottom || lane >= 0
    const loopX = snapAxis(
      preferRight ? box.x + box.width + bump + Math.abs(lane) : box.x - bump - Math.abs(lane),
    )
    return simplifyOrth([
      { x: sourceX, y: sourceY },
      { x: sourceX, y: midY },
      { x: loopX, y: midY },
      { x: loopX, y: tExit.y },
      { x: targetX, y: tExit.y },
      { x: targetX, y: targetY },
    ])
  }

  // Opposite sides (would otherwise route through the node) → wrap around
  const opposite =
    (sourcePosition === Position.Right && targetPosition === Position.Left) ||
    (sourcePosition === Position.Left && targetPosition === Position.Right) ||
    (sourcePosition === Position.Top && targetPosition === Position.Bottom) ||
    (sourcePosition === Position.Bottom && targetPosition === Position.Top)

  if (opposite && isH(sourcePosition)) {
    const loopY = snapAxis(box.y + box.height + bump + Math.abs(lane))
    return simplifyOrth([
      { x: sourceX, y: sourceY },
      sExit,
      { x: sExit.x, y: loopY },
      { x: tExit.x, y: loopY },
      tExit,
      { x: targetX, y: targetY },
    ])
  }
  if (opposite && isV(sourcePosition)) {
    const loopX = snapAxis(box.x + box.width + bump + Math.abs(lane))
    return simplifyOrth([
      { x: sourceX, y: sourceY },
      sExit,
      { x: loopX, y: sExit.y },
      { x: loopX, y: tExit.y },
      tExit,
      { x: targetX, y: targetY },
    ])
  }

  // Adjacent sides → exit both, single exterior corner
  return simplifyOrth([
    { x: sourceX, y: sourceY },
    sExit,
    {
      x: isH(sourcePosition) ? sExit.x : tExit.x,
      y: isH(sourcePosition) ? tExit.y : sExit.y,
    },
    tExit,
    { x: targetX, y: targetY },
  ])
}

/** Interior bends only (excludes current source/target handle positions). */
export function interiorWaypoints(points: Pt[]): Pt[] {
  if (points.length <= 2) return []
  return points.slice(1, -1).map((p) => ({ x: p.x, y: p.y }))
}

/**
 * Build a full orthogonal polyline from stored interior waypoints.
 * Re-anchors ends to the current handles and restores H/V segments if nodes moved.
 */
export function pointsFromWaypoints(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  waypoints: Pt[],
): Pt[] {
  const pts: Pt[] = [
    { x: sourceX, y: sourceY },
    ...waypoints.map((p) => ({ x: p.x, y: p.y })),
    { x: targetX, y: targetY },
  ]
  return simplifyOrth(repairOrthogonal(pts))
}

/** Force every segment onto a shared X or Y with its predecessor. */
function repairOrthogonal(points: Pt[]): Pt[] {
  if (points.length < 2) return points
  const out: Pt[] = [{ ...points[0] }]
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1]
    const cur = points[i]
    const isLast = i === points.length - 1
    if (isLast) {
      // Keep the real target; insert a corner if needed so the last hop is H or V.
      const dx = Math.abs(cur.x - prev.x)
      const dy = Math.abs(cur.y - prev.y)
      if (dx > 0.5 && dy > 0.5) {
        out.push({ x: prev.x, y: cur.y })
      }
      out.push({ ...cur })
      continue
    }
    const dx = Math.abs(cur.x - prev.x)
    const dy = Math.abs(cur.y - prev.y)
    if (dx <= 0.5 || dy <= 0.5) {
      out.push({
        x: dx <= dy ? prev.x : cur.x,
        y: dy < dx ? prev.y : cur.y,
      })
    } else {
      // Prefer keeping the waypoint's dominant axis from the previous point
      out.push({ x: cur.x, y: prev.y })
      out.push({ x: cur.x, y: cur.y })
    }
  }
  return out
}

export type SegmentDragResult = {
  points: Pt[]
  /** Segment index to keep dragging after elbows are inserted. */
  activeSegment: number
}

/**
 * Drag one orthogonal segment to `pointer` (flow coords), keeping H/V edges.
 * Endpoint-adjacent segments insert an elbow so handle anchors stay fixed.
 */
export function dragOrthogonalSegment(
  points: Pt[],
  segmentIndex: number,
  pointer: Pt,
): SegmentDragResult {
  if (segmentIndex < 0 || segmentIndex >= points.length - 1) {
    return { points, activeSegment: segmentIndex }
  }

  const pts = points.map((p) => ({ ...p }))
  const start = pts[segmentIndex]
  const end = pts[segmentIndex + 1]
  const horizontal = Math.abs(start.y - end.y) <= Math.abs(start.x - end.x)
  const isFirst = segmentIndex === 0
  const isLast = segmentIndex === pts.length - 2
  let activeSegment = segmentIndex

  if (horizontal) {
    const y = snapToGrid(pointer.y)
    if (isFirst && isLast) {
      const midX = snapToGrid((start.x + end.x) / 2)
      return {
        points: simplifyOrth([
          start,
          { x: midX, y: start.y },
          { x: midX, y },
          { x: end.x, y },
          end,
        ]),
        activeSegment: 2,
      }
    }
    if (isFirst) {
      const exitX = snapToGrid(
        start.x + Math.sign(end.x - start.x || 1) * STUB,
      )
      pts.splice(1, 0, { x: exitX, y: start.y }, { x: exitX, y })
      pts[3] = { ...pts[3], y }
      activeSegment = 2
    } else if (isLast) {
      const entryX = snapToGrid(
        end.x + Math.sign(start.x - end.x || 1) * STUB,
      )
      pts.splice(pts.length - 1, 0, { x: entryX, y }, { x: entryX, y: end.y })
      pts[pts.length - 4] = { ...pts[pts.length - 4], y }
      activeSegment = pts.length - 4
    } else {
      pts[segmentIndex] = { ...start, y }
      pts[segmentIndex + 1] = { ...end, y }
    }
  } else {
    const x = snapToGrid(pointer.x)
    if (isFirst && isLast) {
      const midY = snapToGrid((start.y + end.y) / 2)
      return {
        points: simplifyOrth([
          start,
          { x: start.x, y: midY },
          { x, y: midY },
          { x, y: end.y },
          end,
        ]),
        activeSegment: 2,
      }
    }
    if (isFirst) {
      const exitY = snapToGrid(
        start.y + Math.sign(end.y - start.y || 1) * STUB,
      )
      pts.splice(1, 0, { x: start.x, y: exitY }, { x, y: exitY })
      pts[3] = { ...pts[3], x }
      activeSegment = 2
    } else if (isLast) {
      const entryY = snapToGrid(
        end.y + Math.sign(start.y - end.y || 1) * STUB,
      )
      pts.splice(pts.length - 1, 0, { x, y: entryY }, { x: end.x, y: entryY })
      pts[pts.length - 4] = { ...pts[pts.length - 4], x }
      activeSegment = pts.length - 4
    } else {
      pts[segmentIndex] = { ...start, x }
      pts[segmentIndex + 1] = { ...end, x }
    }
  }

  const simplified = simplifyOrth(pts)
  return {
    points: simplified,
    activeSegment: Math.max(0, Math.min(activeSegment, simplified.length - 2)),
  }
}

export function computeOrthogonalPoints({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  sourceNest,
  targetNest,
  obstacles = [],
  sourceRect,
  targetRect,
  selfLoop = false,
  gap = PAIR_LANE_GAP,
  stub = STUB,
  waypoints,
}: {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition: Position
  targetPosition: Position
  sourceNest: SideNesting
  targetNest: SideNesting
  obstacles?: ObstacleRect[]
  sourceRect?: ObstacleRect
  targetRect?: ObstacleRect
  selfLoop?: boolean
  gap?: number
  stub?: number
  /** Manual interior bends — when present, skips auto routing. */
  waypoints?: Pt[] | null
}): Pt[] {
  if (waypoints && waypoints.length > 0) {
    return pointsFromWaypoints(sourceX, sourceY, targetX, targetY, waypoints)
  }

  const nest = sourceNest.count >= targetNest.count ? sourceNest : targetNest
  const lane = sideLaneOffset(nest, gap)
  const endpoints = { source: sourceRect, target: targetRect }

  if (selfLoop) {
    return selfLoopWaypoints(
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      nest,
      sourceRect ?? targetRect,
      stub,
      gap,
    )
  }

  const primary = sideAwareWaypoints(
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    sourceNest,
    targetNest,
    gap,
    stub,
  )

  const wraps =
    obstacles.length > 0
      ? wrapCandidates(
          sourceX,
          sourceY,
          targetX,
          targetY,
          sourcePosition,
          targetPosition,
          obstacles,
          stub,
          lane,
        )
      : []
  return pickBestPath(
    [primary, ...wraps],
    obstacles,
    endpoints,
    sourcePosition,
    targetPosition,
  )
}

/**
 * Orthogonal path on the canvas grid. Routes around other nodes when
 * `obstacles` are provided so edges don't cut through diagrams.
 */
export function getOrthogonalEdgePath({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  sourceNest,
  targetNest,
  obstacles = [],
  sourceRect,
  targetRect,
  selfLoop = false,
  borderRadius = 6,
  gap = PAIR_LANE_GAP,
  stub = STUB,
  waypoints,
}: {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition: Position
  targetPosition: Position
  sourceNest: SideNesting
  targetNest: SideNesting
  obstacles?: ObstacleRect[]
  /** Endpoint boxes — middle segments must stay CLEARANCE away. */
  sourceRect?: ObstacleRect
  targetRect?: ObstacleRect
  /** Edge returns to the same node — route outside the box. */
  selfLoop?: boolean
  borderRadius?: number
  gap?: number
  stub?: number
  waypoints?: Pt[] | null
}): [string, number, number, Pt[]] {
  const points = computeOrthogonalPoints({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    sourceNest,
    targetNest,
    obstacles,
    sourceRect,
    targetRect,
    selfLoop,
    gap,
    stub,
    waypoints,
  })

  const path = pointsToPath(points, borderRadius)
  const label = pathLabelCenter(points)
  return [path, label.x, label.y, points]
}

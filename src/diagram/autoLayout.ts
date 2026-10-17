import dagre from '@dagrejs/dagre'
import {
  pickHandleSides,
  toDedicatedHandle,
  type HandleSide,
} from '@/canvas/edges/routing'
import {
  DEFAULT_GROUP_SIZE,
  GRID_SIZE,
  snapCeilToGrid,
  snapToGrid,
} from '@/diagram/grid'
import { orderNodesParentsFirst } from '@/diagram/grouping'
import type { DiagramType, SketchEdge, SketchNode } from '@/diagram/types'

export type LayoutDirection = 'TB' | 'LR'

function directionFor(diagramType: DiagramType): LayoutDirection {
  // ER + architecture read well left-to-right; flows / UML top-down
  if (diagramType === 'erd' || diagramType === 'architecture') return 'LR'
  return 'TB'
}

function styleNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const n = Number.parseFloat(value)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

function nodeSize(node: SketchNode): { width: number; height: number } {
  const style = node.style ?? {}
  const shape = node.data?.shape
  // Decision / connector are fixed in the view but often lack measured size
  // during layout — wrong defaults make side picks (Wait→Ready) U-turn.
  const fallbackW = shape === 'decision' || shape === 'connector' ? 96 : 160
  const fallbackH = shape === 'decision' || shape === 'connector' ? 96 : 80
  return {
    width: node.measured?.width ?? node.width ?? styleNumber(style.width, fallbackW),
    height: node.measured?.height ?? node.height ?? styleNumber(style.height, fallbackH),
  }
}

function findRootId(nodeId: string, nodes: SketchNode[]): string | null {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  let n = byId.get(nodeId)
  if (!n) return null
  const seen = new Set<string>()
  while (n.parentId && byId.has(n.parentId) && !seen.has(n.parentId)) {
    seen.add(n.parentId)
    n = byId.get(n.parentId)!
  }
  return n.id
}

/** Dagre layout for a flat set of nodes; returns top-left positions (React Flow). */
function layoutFlat(
  nodes: SketchNode[],
  edges: SketchEdge[],
  direction: LayoutDirection,
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: direction,
    nodesep: GRID_SIZE * 4,
    // Extra rank gap so bottom→top handles actually face (no U-turn into a
    // neighbor that still overlaps the source node’s vertical span).
    ranksep: GRID_SIZE * 8,
    edgesep: GRID_SIZE * 2,
    marginx: GRID_SIZE * 2,
    marginy: GRID_SIZE * 2,
  })

  const ids = new Set(nodes.map((n) => n.id))
  for (const n of nodes) {
    const { width, height } = nodeSize(n)
    g.setNode(n.id, { width, height })
  }

  const linked = new Set<string>()
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target) || e.source === e.target) continue
    const key = `${e.source}\0${e.target}`
    if (linked.has(key)) continue
    linked.add(key)
    g.setEdge(e.source, e.target)
  }

  dagre.layout(g)

  const positions = new Map<string, { x: number; y: number }>()
  for (const n of nodes) {
    const laid = g.node(n.id)
    if (!laid) continue
    const { width, height } = nodeSize(n)
    positions.set(n.id, {
      x: snapToGrid(laid.x - width / 2),
      y: snapToGrid(laid.y - height / 2),
    })
  }
  return positions
}

function edgesWithin(nodes: SketchNode[], edges: SketchEdge[]): SketchEdge[] {
  const ids = new Set(nodes.map((n) => n.id))
  return edges.filter((e) => ids.has(e.source) && ids.has(e.target))
}

/**
 * Auto-arrange nodes with Dagre.
 * - Layouts children inside each group, then resizes the group to fit
 * - Layouts top-level nodes (groups included) using cross-group edges
 * - Points edge handles along the layout direction for cleaner routes
 */
export function autoLayoutGraph(
  nodes: SketchNode[],
  edges: SketchEdge[],
  diagramType: DiagramType,
): { nodes: SketchNode[]; edges: SketchEdge[] } {
  if (nodes.length === 0) return { nodes, edges }

  const direction = directionFor(diagramType)
  let next = nodes.map((n) => ({ ...n }))

  const childrenByParent = new Map<string, SketchNode[]>()
  for (const n of next) {
    if (!n.parentId) continue
    const list = childrenByParent.get(n.parentId) ?? []
    list.push(n)
    childrenByParent.set(n.parentId, list)
  }

  const pad = GRID_SIZE * 2

  for (const [parentId, children] of childrenByParent) {
    if (children.length === 0) continue
    const positions = layoutFlat(children, edgesWithin(children, edges), direction)

    let minX = Infinity
    let minY = Infinity
    let maxR = -Infinity
    let maxB = -Infinity
    for (const c of children) {
      const p = positions.get(c.id)
      if (!p) continue
      const { width, height } = nodeSize(c)
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxR = Math.max(maxR, p.x + width)
      maxB = Math.max(maxB, p.y + height)
    }
    if (!Number.isFinite(minX)) continue

    const posById = new Map(
      children.map((c) => {
        const p = positions.get(c.id)!
        return [
          c.id,
          {
            x: snapToGrid(p.x - minX + pad),
            y: snapToGrid(p.y - minY + pad),
          },
        ] as const
      }),
    )

    next = next.map((n) => {
      const p = posById.get(n.id)
      return p ? { ...n, position: p } : n
    })

    const contentW = maxR - minX + pad * 2
    const contentH = maxB - minY + pad * 2
    next = next.map((n) => {
      if (n.id !== parentId) return n
      return {
        ...n,
        style: {
          ...n.style,
          width: snapCeilToGrid(Math.max(contentW, DEFAULT_GROUP_SIZE.width)),
          height: snapCeilToGrid(Math.max(contentH, DEFAULT_GROUP_SIZE.height)),
        },
        width: undefined,
        height: undefined,
        measured: undefined,
      }
    })
  }

  const roots = next.filter((n) => !n.parentId)
  const rootIds = new Set(roots.map((n) => n.id))

  // Promote cross-group edges to parent↔parent so groups rank correctly
  const rootEdges: SketchEdge[] = []
  const seenPair = new Set<string>()
  for (const e of edges) {
    const srcRoot = findRootId(e.source, next)
    const tgtRoot = findRootId(e.target, next)
    if (!srcRoot || !tgtRoot || srcRoot === tgtRoot) continue
    if (!rootIds.has(srcRoot) || !rootIds.has(tgtRoot)) continue
    const key = `${srcRoot}\0${tgtRoot}`
    if (seenPair.has(key)) continue
    seenPair.add(key)
    rootEdges.push({ ...e, id: key, source: srcRoot, target: tgtRoot })
  }

  const rootPositions = layoutFlat(roots, rootEdges, direction)
  next = next.map((n) => {
    if (n.parentId) return n
    const p = rootPositions.get(n.id)
    return p ? { ...n, position: p } : n
  })

  const byId = new Map(next.map((n) => [n.id, n]))

  const absoluteBox = (id: string) => {
    const node = byId.get(id)
    if (!node) return null
    let x = node.position.x
    let y = node.position.y
    let p = node.parentId ? byId.get(node.parentId) : undefined
    const seen = new Set<string>()
    while (p && !seen.has(p.id)) {
      seen.add(p.id)
      x += p.position.x
      y += p.position.y
      p = p.parentId ? byId.get(p.parentId) : undefined
    }
    const { width, height } = nodeSize(node)
    return { x, y, width, height }
  }

  // Prefer geometry over a blanket TB/LR side so back-edges (Wait→Ready)
  // don't leave the far side and loop around the whole diagram.
  const fallbackSource: HandleSide = direction === 'LR' ? 'right' : 'bottom'
  const fallbackTarget: HandleSide = direction === 'LR' ? 'left' : 'top'
  const nextEdges = edges.map((e) => {
    const src = absoluteBox(e.source)
    const tgt = absoluteBox(e.target)
    const sides =
      src && tgt
        ? pickHandleSides(src, tgt)
        : { source: fallbackSource, target: fallbackTarget }
    return {
      ...e,
      sourceHandle: toDedicatedHandle(sides.source, e.id, sides.source),
      targetHandle: toDedicatedHandle(sides.target, e.id, sides.target),
    }
  })

  return {
    nodes: orderNodesParentsFirst(next),
    edges: nextEdges,
  }
}

import dagre from '@dagrejs/dagre'
import {
  pickHandleSides,
  toDedicatedHandle,
  type HandleSide,
} from '@/diagram/handles'
import {
  DEFAULT_ENTITY_LAYOUT_HEIGHT,
  DEFAULT_ENTITY_SIZE,
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
  let fallbackW = 160
  let fallbackH = 80
  if (shape === 'decision' || shape === 'connector') {
    fallbackW = 96
    fallbackH = 96
  } else if (shape === 'group') {
    fallbackW = DEFAULT_GROUP_SIZE.width
    fallbackH = DEFAULT_GROUP_SIZE.height
  } else if (shape === 'entity' || shape === 'class' || shape === 'interface') {
    fallbackW = DEFAULT_ENTITY_SIZE.width
    const rows =
      (node.data.attributes?.length ?? 0) + (node.data.methods?.length ?? 0)
    // Header + row pitch estimate before the node has been measured in the DOM
    fallbackH = Math.max(DEFAULT_ENTITY_LAYOUT_HEIGHT, GRID_SIZE * 3 + rows * 22)
  }
  return {
    width: node.measured?.width ?? node.width ?? styleNumber(style.width, fallbackW),
    height: node.measured?.height ?? node.height ?? styleNumber(style.height, fallbackH),
  }
}

/** Nesting depth of a node (0 = root). */
function nestingDepth(nodeId: string, byId: Map<string, SketchNode>): number {
  let d = 0
  let n = byId.get(nodeId)
  const seen = new Set<string>()
  while (n?.parentId && byId.has(n.parentId) && !seen.has(n.parentId)) {
    seen.add(n.parentId)
    d += 1
    n = byId.get(n.parentId)
  }
  return d
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
    // Wider gaps so large group boxes (after nested resize) don't kiss/overlap
    nodesep: GRID_SIZE * 5,
    ranksep: GRID_SIZE * 10,
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
 * Push overlapping siblings apart (same parent / roots). Mutates positions on a copy.
 * Prefers the smaller overlap axis so large group boxes clear each other.
 */
function separateOverlapping(
  nodes: SketchNode[],
  siblingIds: string[],
  gap = GRID_SIZE * 2,
): SketchNode[] {
  if (siblingIds.length < 2) return nodes
  const idSet = new Set(siblingIds)
  type Box = { id: string; x: number; y: number; width: number; height: number }
  const boxes: Box[] = nodes
    .filter((n) => idSet.has(n.id))
    .map((n) => {
      const { width, height } = nodeSize(n)
      return { id: n.id, x: n.position.x, y: n.position.y, width, height }
    })
    .sort((a, b) => a.y - b.y || a.x - b.x)

  let changed = true
  for (let guard = 0; changed && guard < 24; guard++) {
    changed = false
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
        if (overlapX <= 0 || overlapY <= 0) continue
        if (overlapX <= overlapY) {
          b.x = snapToGrid(a.x + a.width + gap)
        } else {
          b.y = snapToGrid(a.y + a.height + gap)
        }
        changed = true
      }
    }
  }

  const pos = new Map(boxes.map((b) => [b.id, { x: b.x, y: b.y }]))
  return nodes.map((n) => {
    const p = pos.get(n.id)
    return p ? { ...n, position: p } : n
  })
}

/**
 * Auto-arrange nodes with Dagre.
 * - Layouts nested groups deepest-first so parent sizes use final child sizes
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

  const childrenByParent = new Map<string, string[]>()
  for (const n of next) {
    if (!n.parentId) continue
    const list = childrenByParent.get(n.parentId) ?? []
    list.push(n.id)
    childrenByParent.set(n.parentId, list)
  }

  const pad = GRID_SIZE * 2
  const byIdFresh = () => new Map(next.map((n) => [n.id, n]))

  // Deepest parents first — otherwise outer groups size against DEFAULT_GROUP_SIZE
  // and nested siblings collide once inner groups expand.
  const parentIds = [...childrenByParent.keys()].sort(
    (a, b) => nestingDepth(b, byIdFresh()) - nestingDepth(a, byIdFresh()),
  )

  for (const parentId of parentIds) {
    const childIds = childrenByParent.get(parentId) ?? []
    if (childIds.length === 0) continue

    const byId = byIdFresh()
    const children = childIds.map((id) => byId.get(id)).filter((n): n is SketchNode => !!n)
    if (children.length === 0) continue

    const positions = layoutFlat(children, edgesWithin(children, edges), direction)

    let minX = Infinity
    let minY = Infinity
    for (const c of children) {
      const p = positions.get(c.id)
      if (!p) continue
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
    }
    if (!Number.isFinite(minX)) continue

    const posById = new Map(
      children.map((c) => {
        const p = positions.get(c.id)
        if (!p) return [c.id, c.position] as const
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

    next = separateOverlapping(next, childIds, pad)

    // Recompute bounds after separation using latest child sizes
    const fresh = byIdFresh()
    let maxR = -Infinity
    let maxB = -Infinity
    minX = Infinity
    minY = Infinity
    for (const id of childIds) {
      const c = fresh.get(id)
      if (!c) continue
      const { width, height } = nodeSize(c)
      minX = Math.min(minX, c.position.x)
      minY = Math.min(minY, c.position.y)
      maxR = Math.max(maxR, c.position.x + width)
      maxB = Math.max(maxB, c.position.y + height)
    }
    if (!Number.isFinite(minX)) continue

    // Normalize so content sits at pad,pad inside the group
    const dx = pad - minX
    const dy = pad - minY
    if (dx !== 0 || dy !== 0) {
      const shift = new Set(childIds)
      next = next.map((n) =>
        shift.has(n.id)
          ? { ...n, position: { x: snapToGrid(n.position.x + dx), y: snapToGrid(n.position.y + dy) } }
          : n,
      )
    }

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

  // Fresh sizes for roots (groups already resized)
  const rootsFresh = roots.map((r) => byIdFresh().get(r.id)!).filter(Boolean)
  const rootPositions = layoutFlat(rootsFresh, rootEdges, direction)
  next = next.map((n) => {
    if (n.parentId) return n
    const p = rootPositions.get(n.id)
    return p ? { ...n, position: p } : n
  })
  next = separateOverlapping(next, [...rootIds], GRID_SIZE * 3)

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
    const data = { ...e.data }
    delete data.waypoints
    return {
      ...e,
      data,
      sourceHandle: toDedicatedHandle(sides.source, e.id, sides.source),
      targetHandle: toDedicatedHandle(sides.target, e.id, sides.target),
    }
  })

  return {
    nodes: orderNodesParentsFirst(next),
    edges: nextEdges,
  }
}

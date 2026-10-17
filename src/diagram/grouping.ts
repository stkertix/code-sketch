import type { SketchNode } from '@/diagram/types'

function styleNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const n = Number.parseFloat(value)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

function readSize(node: SketchNode): { width: number; height: number } {
  const style = node.style ?? {}
  return {
    width: node.measured?.width ?? node.width ?? styleNumber(style.width, 150),
    height: node.measured?.height ?? node.height ?? styleNumber(style.height, 60),
  }
}

function zOf(node: SketchNode): number {
  return node.zIndex ?? 0
}

export function getAbsolutePosition(
  node: SketchNode,
  nodes: SketchNode[],
): { x: number; y: number } {
  let x = node.position.x
  let y = node.position.y
  let parentId = node.parentId
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const seen = new Set<string>()
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId)
    const parent = byId.get(parentId)
    if (!parent) break
    x += parent.position.x
    y += parent.position.y
    parentId = parent.parentId
  }
  return { x, y }
}

export function isGroupNode(node: SketchNode): boolean {
  return node.data.shape === 'group'
}

/**
 * React Flow requires parent nodes to appear before their children in the array.
 * Without this, attach/detach often jumps or nesting breaks.
 */
export function orderNodesParentsFirst(nodes: SketchNode[]): SketchNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const index = new Map(nodes.map((n, i) => [n.id, i]))

  const depth = (node: SketchNode): number => {
    let d = 0
    let parentId = node.parentId
    const seen = new Set<string>()
    while (parentId && byId.has(parentId) && !seen.has(parentId)) {
      seen.add(parentId)
      d += 1
      parentId = byId.get(parentId)!.parentId
    }
    return d
  }

  return [...nodes].sort((a, b) => {
    const dd = depth(a) - depth(b)
    if (dd !== 0) return dd
    return (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0)
  })
}

export function findContainingGroup(
  node: SketchNode,
  nodes: SketchNode[],
): SketchNode | null {
  if (isGroupNode(node)) return null

  const abs = getAbsolutePosition(node, nodes)
  const { width, height } = readSize(node)
  const cx = abs.x + width / 2
  const cy = abs.y + height / 2

  const groups = nodes
    .filter((n) => isGroupNode(n) && n.id !== node.id && n.parentId !== node.id)
    .map((g) => {
      const gAbs = getAbsolutePosition(g, nodes)
      const size = readSize(g)
      return { g, gAbs, size, area: size.width * size.height }
    })
    .filter(
      ({ gAbs, size }) =>
        cx >= gAbs.x &&
        cx <= gAbs.x + size.width &&
        cy >= gAbs.y &&
        cy <= gAbs.y + size.height,
    )
    .sort((a, b) => a.area - b.area)

  return groups[0]?.g ?? null
}

export function attachToGroup(
  node: SketchNode,
  group: SketchNode,
  nodes: SketchNode[],
): SketchNode {
  const abs = getAbsolutePosition(node, nodes)
  const gAbs = getAbsolutePosition(group, nodes)
  return {
    ...node,
    parentId: group.id,
    // Do NOT set extent:'parent' — that clamps drag so nodes can never leave.
    extent: undefined,
    // Stay above the group so the child remains selectable / draggable
    zIndex: Math.max(zOf(node), zOf(group) + 1),
    position: {
      x: abs.x - gAbs.x,
      y: abs.y - gAbs.y,
    },
  }
}

export function detachFromGroup(node: SketchNode, nodes: SketchNode[]): SketchNode {
  if (!node.parentId) return node
  const abs = getAbsolutePosition(node, nodes)
  return {
    ...node,
    position: abs,
    parentId: undefined,
    extent: undefined,
  }
}

/**
 * Drop removed nodes; surviving children of removed parents are detached using
 * absolute positions computed against the pre-delete graph.
 */
export function detachOrphans(
  allNodes: SketchNode[],
  removedIds: ReadonlySet<string>,
): SketchNode[] {
  if (removedIds.size === 0) return allNodes
  return allNodes
    .filter((n) => !removedIds.has(n.id))
    .map((n) => {
      if (!n.parentId || !removedIds.has(n.parentId)) return n
      return detachFromGroup(n, allNodes)
    })
}

export function applyGroupSnap(node: SketchNode, nodes: SketchNode[]): SketchNode[] {
  if (isGroupNode(node)) return nodes

  const group = findContainingGroup(node, nodes)
  let next = node

  if (group) {
    if (node.parentId === group.id) return nodes
    const detached = node.parentId ? detachFromGroup(node, nodes) : node
    const withDetached = nodes.map((n) => (n.id === detached.id ? detached : n))
    next = attachToGroup(detached, group, withDetached)
  } else if (node.parentId) {
    next = detachFromGroup(node, nodes)
  } else {
    return nodes
  }

  return orderNodesParentsFirst(nodes.map((n) => (n.id === next.id ? next : n)))
}

/** Snap several nodes (e.g. multi-drag) against an evolving node list. */
export function applyGroupSnapMany(nodeIds: string[], nodes: SketchNode[]): SketchNode[] {
  let next = nodes
  let changed = false
  for (const id of nodeIds) {
    const node = next.find((n) => n.id === id)
    if (!node) continue
    const snapped = applyGroupSnap(node, next)
    if (snapped !== next) {
      next = snapped
      changed = true
    }
  }
  return changed ? orderNodesParentsFirst(next) : nodes
}

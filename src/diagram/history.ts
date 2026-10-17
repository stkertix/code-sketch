import type { SketchEdge, SketchNode } from '@/diagram/types'

export type Snapshot = {
  nodes: SketchNode[]
  edges: SketchEdge[]
}

const MAX_HISTORY = 50

export function pushHistory(past: Snapshot[], snapshot: Snapshot): Snapshot[] {
  const next = [...past, cloneSnapshot(snapshot)]
  if (next.length > MAX_HISTORY) next.shift()
  return next
}

export function cloneSnapshot(snapshot: Snapshot): Snapshot {
  return {
    nodes: structuredClone(snapshot.nodes),
    edges: structuredClone(snapshot.edges),
  }
}

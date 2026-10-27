import type { Pt } from '@/canvas/edges/routing'

type Listener = () => void

const polylines = new Map<string, Pt[]>()
const listeners = new Set<Listener>()
let version = 0

function emit() {
  version += 1
  listeners.forEach((l) => l())
}

function samePoints(a: Pt[] | undefined, b: Pt[]): boolean {
  if (!a || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].x !== b[i].x || a[i].y !== b[i].y) return false
  }
  return true
}

/** Publish an edge's orthogonal polyline for crossing / hop detection. */
export function setEdgePolyline(id: string, points: Pt[] | null) {
  if (!points || points.length < 2) {
    if (!polylines.has(id)) return
    polylines.delete(id)
    emit()
    return
  }
  const copy = points.map((p) => ({ x: p.x, y: p.y }))
  if (samePoints(polylines.get(id), copy)) return
  polylines.set(id, copy)
  emit()
}

export function subscribeEdgePolylines(onStoreChange: Listener): () => void {
  listeners.add(onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
  }
}

export function getEdgePolylinesVersion(): number {
  return version
}

export function getOtherEdgePolylines(exceptId: string): Pt[][] {
  const out: Pt[][] = []
  for (const [id, pts] of polylines) {
    if (id === exceptId) continue
    out.push(pts)
  }
  return out
}

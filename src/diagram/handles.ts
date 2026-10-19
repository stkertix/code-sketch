import { Position, type Edge } from '@xyflow/react'
import { GRID_SIZE } from '@/diagram/grid'

/** Node side a dedicated edge handle attaches to. */
export type HandleSide = 'top' | 'right' | 'bottom' | 'left'

export const HANDLE_SIDES: HandleSide[] = ['top', 'right', 'bottom', 'left']

export function sideFromHandle(
  handle: string | null | undefined,
  fallback?: Position,
): HandleSide | null {
  if (handle) {
    const base = handle.split(':')[0]
    if (HANDLE_SIDES.includes(base as HandleSide)) return base as HandleSide
  }
  if (fallback === Position.Top) return 'top'
  if (fallback === Position.Right) return 'right'
  if (fallback === Position.Bottom) return 'bottom'
  if (fallback === Position.Left) return 'left'
  return null
}

export function positionFromSide(side: HandleSide): Position {
  switch (side) {
    case 'top':
      return Position.Top
    case 'right':
      return Position.Right
    case 'bottom':
      return Position.Bottom
    case 'left':
      return Position.Left
  }
}

export function dedicatedHandleId(side: HandleSide, edgeId: string): string {
  return `${side}:${edgeId}`
}

export function toDedicatedHandle(
  handle: string | null | undefined,
  edgeId: string,
  fallback: HandleSide = 'right',
): string {
  const side = sideFromHandle(handle) ?? fallback
  return dedicatedHandleId(side, edgeId)
}

export function withDedicatedHandles<E extends Edge>(edge: E): E {
  return {
    ...edge,
    sourceHandle: toDedicatedHandle(edge.sourceHandle, edge.id, 'right'),
    targetHandle: toDedicatedHandle(edge.targetHandle, edge.id, 'left'),
  }
}

/**
 * Pick source/target sides from node geometry so routes stay short.
 * Only use a vertical/horizontal pair when the boxes are actually stacked
 * or side-by-side on that axis — otherwise a close neighbor forces a U-turn.
 */
export function pickHandleSides(
  source: { x: number; y: number; width: number; height: number },
  target: { x: number; y: number; width: number; height: number },
): { source: HandleSide; target: HandleSide } {
  const sx = source.x + source.width / 2
  const sy = source.y + source.height / 2
  const tx = target.x + target.width / 2
  const ty = target.y + target.height / 2
  const dx = tx - sx
  const dy = ty - sy
  const slack = GRID_SIZE

  const canDown = source.y + source.height <= target.y + slack
  const canUp = target.y + target.height <= source.y + slack
  const canRight = source.x + source.width <= target.x + slack
  const canLeft = target.x + target.width <= source.x + slack

  if (Math.abs(dy) >= Math.abs(dx)) {
    if (dy >= 0 && canDown) return { source: 'bottom', target: 'top' }
    if (dy < 0 && canUp) {
      if (dx >= 0) {
        if (canRight) return { source: 'right', target: 'left' }
        return { source: 'top', target: 'left' }
      }
      if (canLeft) return { source: 'left', target: 'right' }
      return { source: 'top', target: 'right' }
    }
    return dx >= 0
      ? { source: 'right', target: 'left' }
      : { source: 'left', target: 'right' }
  }

  if (dx >= 0 && canRight) return { source: 'right', target: 'left' }
  if (dx < 0 && canLeft) return { source: 'left', target: 'right' }
  return dy >= 0
    ? { source: 'bottom', target: 'top' }
    : { source: 'top', target: 'bottom' }
}

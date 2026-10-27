import { EdgeLabelRenderer, Position } from '@xyflow/react'
import { MarkerGlyph } from '@/app/shell/MarkerGlyph'
import type { EdgeMarkerKind } from '@/diagram/edges'

/** Must match the scale applied when rendering glyphs on the canvas. */
export const MARKER_SCALE = 0.65

/**
 * Distance from the node handle onto the edge (away from the node).
 * Contact of each glyph sits at local x ≈ 0 (+X into the node).
 */
const STROKE_CLEARANCE = 0

export const MARKER_INSET_BY_KIND: Record<EdgeMarkerKind, number> = {
  none: 0,
  arrow: STROKE_CLEARANCE,
  arrowOpen: STROKE_CLEARANCE,
  many: STROKE_CLEARANCE,
  oneOrMany: STROKE_CLEARANCE,
  zeroOrMany: STROKE_CLEARANCE,
  one: STROKE_CLEARANCE,
  // Slightly off the node so the bar + optional circle stay clear of the border
  zeroOrOne: 5,
  zero: STROKE_CLEARANCE,
  dot: STROKE_CLEARANCE,
  circle: STROKE_CLEARANCE,
}

/**
 * Unscaled local length along −X occupied by the glyph.
 * The edge stroke is trimmed to this so it does not run under the symbol.
 */
const MARKER_TAIL_LOCAL: Record<EdgeMarkerKind, number> = {
  none: 0,
  arrow: 15,
  arrowOpen: 15,
  many: 16,
  one: 2,
  zero: 10,
  zeroOrOne: 19,
  zeroOrMany: 27,
  oneOrMany: 20,
  dot: 10,
  circle: 10,
}

export function getMarkerInset(kind: EdgeMarkerKind | undefined): number {
  if (!kind || kind === 'none') return 0
  return MARKER_INSET_BY_KIND[kind]
}

/** How far from the handle to end the edge stroke (inset + glyph tail). */
export function getMarkerPathTrim(kind: EdgeMarkerKind | undefined): number {
  if (!kind || kind === 'none') return 0
  return getMarkerInset(kind) + MARKER_TAIL_LOCAL[kind] * MARKER_SCALE
}

/**
 * Move a point from the handle onto the edge (away from the node body).
 * Handle is on the node border; the edge extends outward from that side.
 */
export function insetFromNode(
  x: number,
  y: number,
  position: Position,
  amount: number,
): { x: number; y: number } {
  switch (position) {
    case Position.Top:
      return { x, y: y - amount }
    case Position.Bottom:
      return { x, y: y + amount }
    case Position.Left:
      return { x: x - amount, y }
    case Position.Right:
      return { x: x + amount, y }
    default:
      return { x, y }
  }
}

/** Rotate so local +X (tip direction) points into the node. */
function rotationFor(position: Position): number {
  switch (position) {
    case Position.Top:
      return 90
    case Position.Bottom:
      return -90
    case Position.Left:
      return 0
    case Position.Right:
      return 180
    default:
      return 0
  }
}

const SVG_W = 56
const SVG_H = 24
const VIEW_X = -28
const VIEW_Y = -12

type Props = {
  kind: EdgeMarkerKind | undefined
  x: number
  y: number
  position: Position
  color?: string
  /** Grey-out when outside the selection neighborhood. */
  dimmed?: boolean
}

/**
 * Renders endpoint in the edge-label overlay layer so it always paints above nodes.
 */
export function EdgeEndpoint({
  kind,
  x,
  y,
  position,
  color = 'var(--cs-edge, #8b95a8)',
  dimmed = false,
}: Props) {
  if (!kind || kind === 'none') return null
  const pos = insetFromNode(x, y, position, getMarkerInset(kind))
  const rot = rotationFor(position)

  return (
    <EdgeLabelRenderer>
      <div
        className="cs-edge-endpoint nodrag nopan"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: SVG_W,
          height: SVG_H,
          transform: `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px) rotate(${rot}deg)`,
          pointerEvents: 'none',
          zIndex: 10,
          opacity: dimmed ? 0.22 : undefined,
          filter: dimmed ? 'grayscale(0.55)' : undefined,
        }}
      >
        <svg
          width={SVG_W}
          height={SVG_H}
          viewBox={`${VIEW_X} ${VIEW_Y} ${SVG_W} ${SVG_H}`}
          overflow="visible"
          aria-hidden
        >
          <g transform={`scale(${MARKER_SCALE})`}>
            <MarkerGlyph kind={kind} color={color} />
          </g>
        </svg>
      </div>
    </EdgeLabelRenderer>
  )
}

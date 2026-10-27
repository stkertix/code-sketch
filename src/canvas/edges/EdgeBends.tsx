import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { EdgeLabelRenderer, useReactFlow } from '@xyflow/react'
import {
  dragOrthogonalSegment,
  interiorWaypoints,
  type Pt,
} from '@/canvas/edges/routing'
import { useDiagramStore } from '@/diagram/store'

type Props = {
  edgeId: string
  points: Pt[]
  /** Accent color for handles. */
  color?: string
}

const MIN_SEG = 12

/**
 * Draggable mid-segment handles for orthogonal edges (visible when selected).
 * Dragging a segment moves that bend corridor; result is stored as waypoints.
 */
export function EdgeBends({ edgeId, points, color = 'var(--cs-accent)' }: Props) {
  const { screenToFlowPosition } = useReactFlow()
  const setEdgeWaypoints = useDiagramStore((s) => s.setEdgeWaypoints)
  const takeSnapshot = useDiagramStore((s) => s.takeSnapshot)
  const persistDraft = useDiagramStore((s) => s.persistDraft)

  const dragging = useRef<{ segment: number; points: Pt[] } | null>(null)
  const [livePoints, setLivePoints] = useState<Pt[] | null>(null)
  const [activeSeg, setActiveSeg] = useState<number | null>(null)

  const display = livePoints ?? points

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragging.current
      if (!drag) return
      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const { points: next, activeSegment } = dragOrthogonalSegment(
        drag.points,
        drag.segment,
        flow,
      )
      dragging.current = { segment: activeSegment, points: next }
      setLivePoints(next)
      setEdgeWaypoints(edgeId, interiorWaypoints(next), { skipHistory: true })
    },
    [edgeId, screenToFlowPosition, setEdgeWaypoints],
  )

  const endDrag = useCallback(() => {
    if (!dragging.current) return
    dragging.current = null
    setActiveSeg(null)
    setLivePoints(null)
    persistDraft()
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', endDrag)
    window.removeEventListener('pointercancel', endDrag)
  }, [onPointerMove, persistDraft])

  useEffect(() => () => endDrag(), [endDrag])

  const startDrag = (segment: number, e: ReactPointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    takeSnapshot()
    dragging.current = { segment, points: points.map((p) => ({ ...p })) }
    setActiveSeg(segment)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)
  }

  const handles: Array<{
    key: string
    segment: number
    x: number
    y: number
    cursor: string
  }> = []

  for (let i = 0; i < display.length - 1; i++) {
    const a = display[i]
    const b = display[i + 1]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len < MIN_SEG) continue
    const horizontal = Math.abs(a.y - b.y) <= Math.abs(a.x - b.x)
    handles.push({
      key: `seg-${i}`,
      segment: i,
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      cursor: horizontal ? 'ns-resize' : 'ew-resize',
    })
  }

  if (handles.length === 0) return null

  return (
    <EdgeLabelRenderer>
      {handles.map((h) => (
        <div
          key={h.key}
          className="nodrag nopan"
          onPointerDown={(e) => startDrag(h.segment, e)}
          title="Drag to bend the line"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${h.x}px, ${h.y}px)`,
            width: 10,
            height: 10,
            borderRadius: 2,
            background: 'var(--cs-surface-2)',
            border: `1.5px solid ${color}`,
            boxShadow: '0 0 0 1px rgba(0,0,0,0.15)',
            pointerEvents: 'all',
            cursor: activeSeg === h.segment ? 'grabbing' : h.cursor,
            zIndex: 12,
            opacity: activeSeg != null && activeSeg !== h.segment ? 0.45 : 1,
          }}
        />
      ))}
    </EdgeLabelRenderer>
  )
}

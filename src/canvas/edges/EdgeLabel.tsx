import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { EdgeLabelRenderer, useReactFlow } from '@xyflow/react'
import { useDiagramStore } from '@/diagram/store'
import { pointAtPathT, resolveLabelT, snapPointToPathT } from '@/canvas/edges/labelPath'

type Props = {
  edgeId: string
  path: string
  text: string
  /** Stored 0–1 offset along the edge; defaults to mid-path. */
  labelT?: number
  /** Fallback center when path length is unavailable. */
  fallbackX: number
  fallbackY: number
}

/**
 * Draggable edge label that stays snapped to the stroke.
 * Drag updates `data.labelT` (fraction along the path).
 */
export function EdgeLabel({ edgeId, path, text, labelT, fallbackX, fallbackY }: Props) {
  const { screenToFlowPosition } = useReactFlow()
  const setEdgeLabelT = useDiagramStore((s) => s.setEdgeLabelT)
  const takeSnapshot = useDiagramStore((s) => s.takeSnapshot)
  const persistDraft = useDiagramStore((s) => s.persistDraft)
  const dragging = useRef(false)
  const [isDragging, setIsDragging] = useState(false)
  const [liveT, setLiveT] = useState<number | null>(null)

  const t = liveT ?? resolveLabelT(labelT)
  const onPath = path ? pointAtPathT(path, t) : { x: fallbackX, y: fallbackY }
  const x = Number.isFinite(onPath.x) ? onPath.x : fallbackX
  const y = Number.isFinite(onPath.y) ? onPath.y : fallbackY

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging.current || !path) return
      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const next = snapPointToPathT(path, flow.x, flow.y)
      setLiveT(next)
      setEdgeLabelT(edgeId, next, { skipHistory: true })
    },
    [edgeId, path, screenToFlowPosition, setEdgeLabelT],
  )

  const endDrag = useCallback(() => {
    if (!dragging.current) return
    dragging.current = false
    setIsDragging(false)
    setLiveT(null)
    persistDraft()
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', endDrag)
    window.removeEventListener('pointercancel', endDrag)
  }, [onPointerMove, persistDraft])

  useEffect(() => () => endDrag(), [endDrag])

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    takeSnapshot()
    dragging.current = true
    setIsDragging(true)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)
  }

  return (
    <EdgeLabelRenderer>
      <div
        className="nodrag nopan"
        onPointerDown={onPointerDown}
        title="Drag to move label along the line"
        style={{
          position: 'absolute',
          transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
          pointerEvents: 'all',
          cursor: isDragging ? 'grabbing' : 'grab',
          background: 'var(--cs-surface-2)',
          color: 'var(--cs-text)',
          border: '1px solid var(--cs-border)',
          borderRadius: 4,
          padding: '2px 8px',
          fontSize: 11,
          fontWeight: 500,
          lineHeight: 1.3,
          whiteSpace: 'nowrap',
          boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
          userSelect: 'none',
          zIndex: 10,
        }}
      >
        {text}
      </div>
    </EdgeLabelRenderer>
  )
}

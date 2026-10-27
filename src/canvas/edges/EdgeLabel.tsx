import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { EdgeLabelRenderer, useStore, useReactFlow } from '@xyflow/react'
import { useEdgeFocus } from '@/canvas/connectionHighlight'
import { useDiagramStore } from '@/diagram/store'
import {
  labelHalfExtentOnNormal,
  labelPointAt,
  pathNormalAt,
  projectPointToPath,
  resolveLabelOffset,
  resolveLabelT,
} from '@/canvas/edges/labelPath'

type Props = {
  edgeId: string
  path: string
  text: string
  /** Stored 0–1 offset along the edge; defaults to mid-path. */
  labelT?: number
  /** Signed perpendicular center offset from the stroke. */
  labelOffset?: number
  /** Fallback center when path length is unavailable. */
  fallbackX: number
  fallbackY: number
}

/**
 * Draggable edge label: 1px offset steps, max 1 grid gap from label edge to stroke.
 * Double-click snaps the label back onto the stroke at the current t.
 */
export function EdgeLabel({
  edgeId,
  path,
  text,
  labelT,
  labelOffset,
  fallbackX,
  fallbackY,
}: Props) {
  const { screenToFlowPosition } = useReactFlow()
  const zoom = useStore((s) => s.transform[2]) || 1
  const setEdgeLabelPlacement = useDiagramStore((s) => s.setEdgeLabelPlacement)
  const takeSnapshot = useDiagramStore((s) => s.takeSnapshot)
  const persistDraft = useDiagramStore((s) => s.persistDraft)
  const dimmed = useEdgeFocus(edgeId) === 'dimmed'
  const dragging = useRef(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const halfExtentRef = useRef(0)
  const tRef = useRef(0.5)
  const [isDragging, setIsDragging] = useState(false)
  const [live, setLive] = useState<{ t: number; offset: number } | null>(null)
  const [halfExtent, setHalfExtent] = useState(0)

  const t = live?.t ?? resolveLabelT(labelT)
  const offset = live?.offset ?? resolveLabelOffset(labelOffset, halfExtent)
  tRef.current = t
  const onPath = path
    ? labelPointAt(path, t, offset, halfExtent)
    : { x: fallbackX, y: fallbackY }
  const x = Number.isFinite(onPath.x) ? onPath.x : fallbackX
  const y = Number.isFinite(onPath.y) ? onPath.y : fallbackY

  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      const halfW = rect.width / zoom / 2
      const halfH = rect.height / zoom / 2
      const n = path ? pathNormalAt(path, t) : { x: 0, y: 1 }
      const next = labelHalfExtentOnNormal(halfW, halfH, n.x, n.y)
      halfExtentRef.current = next
      setHalfExtent(next)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [path, t, text, zoom])

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging.current || !path) return
      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const next = projectPointToPath(path, flow.x, flow.y, halfExtentRef.current)
      setLive(next)
      setEdgeLabelPlacement(
        edgeId,
        { labelT: next.t, labelOffset: next.offset },
        { skipHistory: true },
      )
    },
    [edgeId, path, screenToFlowPosition, setEdgeLabelPlacement],
  )

  const endDrag = useCallback(() => {
    if (!dragging.current) return
    dragging.current = false
    setIsDragging(false)
    setLive(null)
    persistDraft()
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', endDrag)
    window.removeEventListener('pointercancel', endDrag)
  }, [onPointerMove, persistDraft])

  useEffect(() => () => endDrag(), [endDrag])

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    // Let double-click through without starting a drag
    if (e.detail > 1) return
    e.preventDefault()
    e.stopPropagation()
    takeSnapshot()
    dragging.current = true
    setIsDragging(true)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)
  }

  const onDoubleClick = (e: ReactPointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (dragging.current) endDrag()
    takeSnapshot()
    const nextT = tRef.current
    setLive({ t: nextT, offset: 0 })
    setEdgeLabelPlacement(edgeId, { labelT: nextT, labelOffset: 0 })
    persistDraft()
    setLive(null)
  }

  return (
    <EdgeLabelRenderer>
      <div
        ref={boxRef}
        className="nodrag nopan"
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
        title="Drag to move · double-click to snap onto the line"
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
          whiteSpace: 'pre-line',
          textAlign: 'center',
          maxWidth: 220,
          boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
          userSelect: 'none',
          zIndex: 10,
          opacity: dimmed ? 0.22 : undefined,
          filter: dimmed ? 'grayscale(0.55)' : undefined,
        }}
      >
        {text}
      </div>
    </EdgeLabelRenderer>
  )
}

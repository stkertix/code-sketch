import { useCallback, useEffect, useLayoutEffect, useMemo, useSyncExternalStore } from 'react'
import {
  BaseEdge,
  getBezierPath,
  getStraightPath,
  useStore,
  type Edge,
  type EdgeProps,
} from '@xyflow/react'
import { useEdgeFocus } from '@/canvas/connectionHighlight'
import { EdgeBends } from '@/canvas/edges/EdgeBends'
import { EdgeEndpoint, getMarkerPathTrim, insetFromNode } from '@/canvas/edges/EdgeEndpoints'
import { EdgeLabel } from '@/canvas/edges/EdgeLabel'
import {
  getEdgePolylinesVersion,
  getOtherEdgePolylines,
  setEdgePolyline,
  subscribeEdgePolylines,
} from '@/canvas/edges/edgeGeometry'
import { buildHoppedPath } from '@/canvas/edges/edgeJumps'
import {
  strokeDashForLineStyle,
  type EdgeLineStyle,
  type EdgeMarkerKind,
  type SketchEdgeData,
} from '@/diagram/edges'
import {
  getOrthogonalEdgePath,
  getSideNesting,
  offsetEndpoints,
  sideFromHandle,
  sideLaneOffset,
  type ObstacleRect,
  type Pt,
  type SideNesting,
} from '@/canvas/edges/routing'
import { useDiagramStore } from '@/diagram/store'
import { useUiStore } from '@/app/ui/store'

export type SketchEdgeType = Edge<SketchEdgeData>

export function SketchEdge({
  id,
  source,
  target,
  sourceHandleId,
  targetHandleId,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  data,
  style,
  selected,
  type,
}: EdgeProps<SketchEdgeType>) {
  const sourceMarker = (data?.sourceMarker as EdgeMarkerKind | undefined) ?? 'none'
  const targetMarker = (data?.targetMarker as EdgeMarkerKind | undefined) ?? 'arrow'
  const lineStyle = (data?.lineStyle as EdgeLineStyle | undefined) ?? 'solid'
  const labelT = data?.labelT
  const labelOffset = data?.labelOffset
  // Flowchart: allow Start→Ready / Wait→Ready style edges to share corridors
  const allowOverlap = useDiagramStore((s) => s.diagramType === 'flowchart')
  const emptyNest = useMemo<SideNesting>(() => ({ rank: 0, count: 1 }), [])

  const { sourceNest, targetNest, laneOffset, obstacles, sourceRect, targetRect } = useStore(
    useCallback(
      (s) => {
        const srcSide = sideFromHandle(sourceHandleId, sourcePosition)
        const tgtSide = sideFromHandle(targetHandleId, targetPosition)
        const sourceNest = allowOverlap
          ? emptyNest
          : getSideNesting(s.edges, s.nodes, id, source, srcSide)
        const targetNest = allowOverlap
          ? emptyNest
          : getSideNesting(s.edges, s.nodes, id, target, tgtSide)
        const dominant = sourceNest.count >= targetNest.count ? sourceNest : targetNest

        const obstacles: ObstacleRect[] = []
        let sourceRect: ObstacleRect | undefined
        let targetRect: ObstacleRect | undefined

        for (const [nodeId, node] of s.nodeLookup) {
          const shape = (node.data as { shape?: string } | undefined)?.shape
          if (shape === 'group') continue
          const abs = node.internals.positionAbsolute
          const w = node.measured?.width ?? node.width ?? 160
          const h = node.measured?.height ?? node.height ?? 80
          if (w < 8 || h < 8) continue
          const rect = { x: abs.x, y: abs.y, width: w, height: h }
          if (nodeId === source || nodeId === target) {
            if (nodeId === source) sourceRect = rect
            if (nodeId === target) targetRect = rect
            // Self-loop: same node is both ends — keep it out of obstacles
            continue
          }
          obstacles.push(rect)
        }

        return {
          sourceNest,
          targetNest,
          laneOffset: sideLaneOffset(dominant),
          obstacles,
          sourceRect,
          targetRect,
        }
      },
      [
        id,
        source,
        target,
        sourceHandleId,
        targetHandleId,
        sourcePosition,
        targetPosition,
        allowOverlap,
        emptyNest,
      ],
    ),
  )

  // Marker trim only for straight/bezier. Orthogonal keeps handle endpoints
  // on the node; mid-path clearance is handled in routing (1 grid).
  const sourceTrim = getMarkerPathTrim(sourceMarker)
  const targetTrim = getMarkerPathTrim(targetMarker)
  const isOrtho = type !== 'straight' && type !== 'default'

  let sx = sourceX
  let sy = sourceY
  let tx = targetX
  let ty = targetY
  if (!isOrtho) {
    if (sourceTrim > 0) {
      const p = insetFromNode(sx, sy, sourcePosition, sourceTrim)
      sx = p.x
      sy = p.y
    }
    if (targetTrim > 0) {
      const p = insetFromNode(tx, ty, targetPosition, targetTrim)
      tx = p.x
      ty = p.y
    }
  }

  const isSelfLoop = source === target
  const waypoints = data?.waypoints

  const shifted =
    type === 'straight' || type === 'default'
      ? offsetEndpoints(sx, sy, tx, ty, isSelfLoop ? Math.max(24, Math.abs(laneOffset) + 24) : laneOffset)
      : null

  let edgePath: string
  let labelX: number
  let labelY: number
  let orthoPoints: Pt[] | null = null

  if (type === 'straight') {
    ;[edgePath, labelX, labelY] = getStraightPath({
      sourceX: shifted!.sourceX,
      sourceY: shifted!.sourceY,
      targetX: shifted!.targetX,
      targetY: shifted!.targetY,
    })
  } else if (type === 'default') {
    ;[edgePath, labelX, labelY] = getBezierPath({
      sourceX: shifted!.sourceX,
      sourceY: shifted!.sourceY,
      targetX: shifted!.targetX,
      targetY: shifted!.targetY,
      sourcePosition,
      targetPosition,
      curvature: isSelfLoop ? 0.85 : 0.35 + Math.abs(laneOffset) * 0.015,
    })
  } else {
    ;[edgePath, labelX, labelY, orthoPoints] = getOrthogonalEdgePath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      sourceNest,
      targetNest,
      obstacles,
      sourceRect,
      targetRect,
      selfLoop: isSelfLoop,
      borderRadius: type === 'step' ? 0 : 6,
      waypoints,
    })
  }

  const borderRadius = type === 'step' ? 0 : 6
  const showEdgeArcs = useUiStore((s) => s.showEdgeArcs)
  const geomVersion = useSyncExternalStore(
    subscribeEdgePolylines,
    getEdgePolylinesVersion,
    getEdgePolylinesVersion,
  )

  useLayoutEffect(() => {
    setEdgePolyline(id, orthoPoints)
  }, [id, orthoPoints])

  useEffect(() => () => setEdgePolyline(id, null), [id])

  const hoppedPath = useMemo(() => {
    if (!showEdgeArcs || !orthoPoints || orthoPoints.length < 2) return edgePath
    void geomVersion
    const others = getOtherEdgePolylines(id)
    if (others.length === 0) return edgePath
    return buildHoppedPath(orthoPoints, borderRadius, others)
  }, [showEdgeArcs, orthoPoints, edgePath, id, borderRadius, geomVersion])

  const focus = useEdgeFocus(id)
  const related = focus === 'related' || !!selected
  const dimmed = focus === 'dimmed'
  const emphasized = related
  const text = typeof label === 'string' ? label : ''
  const stroke = emphasized
    ? 'var(--cs-accent, #5b8def)'
    : 'var(--cs-edge, #8b95a8)'

  return (
    <>
      <BaseEdge
        id={id}
        path={hoppedPath}
        interactionWidth={24}
        style={{
          ...style,
          stroke,
          strokeWidth: selected ? 2.5 : related ? 2.25 : 2,
          opacity: dimmed ? 0.22 : related && !selected ? 0.92 : undefined,
          filter: dimmed ? 'grayscale(0.55)' : undefined,
          strokeDasharray: strokeDashForLineStyle(lineStyle),
          strokeLinecap: lineStyle === 'dotted' ? 'round' : undefined,
        }}
      />
      <EdgeEndpoint
        kind={sourceMarker}
        x={sourceX}
        y={sourceY}
        position={sourcePosition}
        color={stroke}
        dimmed={dimmed}
      />
      <EdgeEndpoint
        kind={targetMarker}
        x={targetX}
        y={targetY}
        position={targetPosition}
        color={stroke}
        dimmed={dimmed}
      />
      {selected && orthoPoints && orthoPoints.length >= 2 ? (
        <EdgeBends edgeId={id} points={orthoPoints} color={stroke} />
      ) : null}
      {text ? (
        <EdgeLabel
          edgeId={id}
          path={hoppedPath}
          text={text}
          labelT={labelT}
          labelOffset={labelOffset}
          fallbackX={labelX}
          fallbackY={labelY}
        />
      ) : null}
    </>
  )
}

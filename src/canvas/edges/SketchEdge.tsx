import { useCallback, useMemo } from 'react'
import {
  BaseEdge,
  getBezierPath,
  getStraightPath,
  useStore,
  type Edge,
  type EdgeProps,
} from '@xyflow/react'
import { EdgeEndpoint, getMarkerPathTrim, insetFromNode } from '@/canvas/edges/EdgeEndpoints'
import { EdgeLabel } from '@/canvas/edges/EdgeLabel'
import {
  strokeDashForLineStyle,
  type EdgeLineStyle,
  type EdgeMarkerKind,
  type SketchEdgeData,
} from '@/canvas/edges/markers'
import {
  getOrthogonalEdgePath,
  getSideNesting,
  offsetEndpoints,
  sideFromHandle,
  sideLaneOffset,
  type ObstacleRect,
  type SideNesting,
} from '@/canvas/edges/routing'
import { useDiagramStore } from '@/diagram/store'

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

  // Orthogonal: route from exact handles so corridors stay on-grid.
  // Marker trim is only applied for straight/bezier (no mid-path grid).
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

  const shifted =
    type === 'straight' || type === 'default'
      ? offsetEndpoints(sx, sy, tx, ty, isSelfLoop ? Math.max(24, Math.abs(laneOffset) + 24) : laneOffset)
      : null

  const [edgePath, labelX, labelY] =
    type === 'straight'
      ? getStraightPath({
          sourceX: shifted!.sourceX,
          sourceY: shifted!.sourceY,
          targetX: shifted!.targetX,
          targetY: shifted!.targetY,
        })
      : type === 'default'
        ? getBezierPath({
            sourceX: shifted!.sourceX,
            sourceY: shifted!.sourceY,
            targetX: shifted!.targetX,
            targetY: shifted!.targetY,
            sourcePosition,
            targetPosition,
            curvature: isSelfLoop ? 0.85 : 0.35 + Math.abs(laneOffset) * 0.015,
          })
        : getOrthogonalEdgePath({
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
          })

  const text = typeof label === 'string' ? label : ''
  const stroke = selected ? 'var(--cs-accent, #5b8def)' : 'var(--cs-edge, #8b95a8)'

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        interactionWidth={24}
        style={{
          ...style,
          stroke,
          strokeWidth: selected ? 2.5 : 2,
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
      />
      <EdgeEndpoint
        kind={targetMarker}
        x={targetX}
        y={targetY}
        position={targetPosition}
        color={stroke}
      />
      {text ? (
        <EdgeLabel
          edgeId={id}
          path={edgePath}
          text={text}
          labelT={labelT}
          fallbackX={labelX}
          fallbackY={labelY}
        />
      ) : null}
    </>
  )
}

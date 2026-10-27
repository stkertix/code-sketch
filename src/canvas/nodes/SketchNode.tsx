import {
  Handle,
  NodeResizer,
  useStore,
  useReactFlow,
  useUpdateNodeInternals,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import { Fragment, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { parseAttributeLines } from '@/diagram/entityAttributes'
import { gridUnits, snapCeilToGrid } from '@/diagram/grid'
import {
  HANDLE_SIDES,
  getSidePortLayout,
  gridHandleId,
  gridPortOffsets,
  handleStyleForSide,
  positionFromSide,
} from '@/canvas/edges/routing'
import {
  mergeDimStyle,
  nodeOutlineStyle,
  useNodeFocus,
} from '@/canvas/connectionHighlight'
import {
  labelFlexColClasses,
  labelTextAlignClass,
  resolveLabelAlignX,
  resolveLabelAlignY,
} from '@/diagram/labelAlign'
import { useDiagramStore } from '@/diagram/store'
import type { SketchNodeData } from '@/diagram/types'

type SketchFlowNode = Node<SketchNodeData, 'sketch'>

const handleClass =
  '!bg-[var(--cs-handle)] !w-2.5 !h-2.5 !border !border-[var(--cs-handle-border)]'

/**
 * Connector dots on every grid along each side, plus dedicated ports for
 * edges that still use edge-id handles (import / auto-layout).
 */
function SidePortHandles({ nodeId }: { nodeId: string }) {
  const edges = useStore((s) => s.edges)
  const nodes = useStore((s) => s.nodes)
  const updateInternals = useUpdateNodeInternals()
  // Flowcharts allow converging edges to share one attachment point
  const overlapPorts = useDiagramStore((s) => s.diagramType === 'flowchart')

  const node = nodes.find((n) => n.id === nodeId)
  const w = node?.width ?? node?.measured?.width ?? gridUnits(10)
  const h = node?.height ?? node?.measured?.height ?? gridUnits(5)

  const layouts = useMemo(
    () =>
      HANDLE_SIDES.map((side) => {
        const sideLength = side === 'left' || side === 'right' ? h : w
        return {
          side,
          grids: gridPortOffsets(sideLength),
          ports: getSidePortLayout(edges, nodes, nodeId, side, overlapPorts),
        }
      }),
    [edges, nodes, nodeId, overlapPorts, w, h],
  )

  const layoutKey = layouts
    .map(
      ({ side, grids, ports }) =>
        `${side}:g[${grids.join(',')}]p[${ports.map((p) => `${p.handleId}@${p.offsetPx}`).join(',')}]`,
    )
    .join('|')

  useLayoutEffect(() => {
    updateInternals(nodeId)
  }, [layoutKey, nodeId, updateInternals])

  return (
    <>
      {layouts.map(({ side, grids, ports }) => {
        const position = positionFromSide(side)
        return (
          <Fragment key={side}>
            {grids.map((offsetPx) => (
              <Handle
                key={gridHandleId(side, offsetPx)}
                type="source"
                position={position}
                id={gridHandleId(side, offsetPx)}
                className={handleClass}
                style={handleStyleForSide(side, offsetPx)}
              />
            ))}
            {ports.map((port) => (
              <Handle
                key={port.handleId}
                type="source"
                position={position}
                id={port.handleId}
                className={handleClass}
                style={handleStyleForSide(side, port.offsetPx)}
              />
            ))}
          </Fragment>
        )
      })}
    </>
  )
}

/** Resize handles; store also snaps width/height to GRID_SIZE. */
function GridResizer({
  selected,
  minWidth = gridUnits(6),
  minHeight = gridUnits(4),
}: {
  selected?: boolean
  minWidth?: number
  minHeight?: number
}) {
  return (
    <NodeResizer
      minWidth={minWidth}
      minHeight={minHeight}
      isVisible={!!selected}
      lineClassName="!border-[var(--cs-accent)]"
      handleClassName="!h-2.5 !w-2.5 !bg-[var(--cs-accent)] !border-none"
    />
  )
}

function NodeChrome({
  nodeId,
  data,
  selected,
  related = false,
  children,
  className = '',
  resizable = true,
}: {
  nodeId: string
  data: SketchNodeData
  selected?: boolean
  related?: boolean
  children: ReactNode
  className?: string
  resizable?: boolean
}) {
  const ax = resolveLabelAlignX(data)
  const ay = resolveLabelAlignY(data)
  return (
    <div
      className={`relative box-border flex h-full min-h-[48px] w-full min-w-[96px] flex-col px-3 py-2 text-sm text-[var(--cs-on-shape)] shadow-md ${labelFlexColClasses(ax, ay)} ${className}`}
      style={{
        background: data.color,
        outline: nodeOutlineStyle(selected, related, '1px solid rgba(0,0,0,0.2)'),
      }}
    >
      {resizable ? <GridResizer selected={selected} /> : null}
      <SidePortHandles nodeId={nodeId} />
      <div className={`w-full ${labelTextAlignClass(ax)}`}>{children}</div>
    </div>
  )
}

/** Classic cylinder / drum shape for database nodes. */
function DatabaseCylinder({
  id,
  data,
  selected,
  related = false,
}: {
  id: string
  data: SketchNodeData
  selected?: boolean
  related?: boolean
}) {
  const ax = resolveLabelAlignX(data)
  const ay = resolveLabelAlignY(data)
  const emphasized = !!(selected || related)
  const stroke = selected
    ? 'var(--cs-accent)'
    : related
      ? 'color-mix(in srgb, var(--cs-accent) 70%, transparent)'
      : 'rgba(0,0,0,0.25)'
  const face = `color-mix(in srgb, ${data.color} 88%, #fff 12%)`

  return (
    <div
      className="relative box-border h-full min-h-[64px] w-full min-w-[96px] text-sm text-[var(--cs-on-shape)]"
      style={{
        filter: selected ? undefined : 'drop-shadow(0 1px 2px rgba(0,0,0,0.18))',
      }}
    >
      <GridResizer selected={selected} minWidth={gridUnits(6)} minHeight={gridUnits(4)} />
      <SidePortHandles nodeId={id} />
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 120"
        preserveAspectRatio="none"
        aria-hidden
      >
        {/* Body: vertical sides + bottom arc (no bottom ellipse face) */}
        <path
          d="M0 22 V98 A50 18 0 0 0 100 98 V22 A50 18 0 0 0 0 22 Z"
          fill={data.color}
          stroke={stroke}
          strokeWidth={emphasized ? 2.2 : 1.2}
          vectorEffect="non-scaling-stroke"
        />
        {/* Top ellipse only */}
        <ellipse
          cx="50"
          cy="22"
          rx="50"
          ry="18"
          fill={face}
          stroke={stroke}
          strokeWidth={emphasized ? 2.2 : 1.2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div
        className={`relative z-[1] flex h-full w-full flex-col px-3 pb-3 pt-7 ${labelFlexColClasses(ax, ay)}`}
      >
        <div className={`w-full ${labelTextAlignClass(ax)}`}>
          <div className="whitespace-pre-line font-medium leading-snug">{data.label}</div>
          {data.subtitle ? <div className="text-[11px] opacity-80">{data.subtitle}</div> : null}
        </div>
      </div>
    </div>
  )
}

function readNodeHeight(node: SketchFlowNode | undefined): number {
  if (!node) return 0
  const fromStyle = node.style?.height
  const styleH = typeof fromStyle === 'number' ? fromStyle : Number.parseFloat(String(fromStyle ?? ''))
  return node.height ?? node.measured?.height ?? (Number.isFinite(styleH) ? styleH : 0)
}

/** Entity / class / interface card: resize snaps to grid, min height follows content. */
function AttributeCard({
  id,
  data,
  selected,
  related = false,
}: {
  id: string
  data: SketchNodeData
  selected?: boolean
  related?: boolean
}) {
  const { setNodes, getNode } = useReactFlow()
  const updateInternals = useUpdateNodeInternals()
  const contentRef = useRef<HTMLDivElement>(null)
  const [minHeight, setMinHeight] = useState(gridUnits(6))

  const attrs = data.attributes ?? []
  const methods = data.methods ?? []
  const isEntity = data.shape === 'entity'
  const entityRows = isEntity ? parseAttributeLines(attrs) : []

  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el) return
    const contentH = el.scrollHeight
    const nextMin = Math.max(gridUnits(6), snapCeilToGrid(contentH))
    setMinHeight(nextMin)

    const node = getNode(id) as SketchFlowNode | undefined
    const currentH = readNodeHeight(node)
    if (currentH > 0 && currentH < nextMin) {
      setNodes((nodes) =>
        nodes.map((n) =>
          n.id === id
            ? {
                ...n,
                height: nextMin,
                style: {
                  ...n.style,
                  width: n.style?.width ?? n.width ?? gridUnits(12),
                  height: nextMin,
                },
                measured: undefined,
              }
            : n,
        ),
      )
      updateInternals(id)
    }
  }, [
    id,
    data.label,
    data.shape,
    attrs.join('\n'),
    methods.join('\n'),
    getNode,
    setNodes,
    updateInternals,
  ])

  return (
    <div
      className="relative box-border flex h-full min-w-[192px] flex-col overflow-hidden rounded-md bg-[var(--cs-node-card)] text-[var(--cs-node-card-text)] shadow-md"
      style={{
        minHeight,
        outline: nodeOutlineStyle(selected, related, `1px solid ${data.color}`),
      }}
    >
      <GridResizer selected={selected} minWidth={gridUnits(12)} minHeight={minHeight} />
      <SidePortHandles nodeId={id} />
      <div ref={contentRef} className="flex flex-col">
        <div
          className={`px-3 py-2 font-semibold text-[var(--cs-on-shape)] ${labelTextAlignClass(resolveLabelAlignX(data))}`}
          style={{ background: data.color }}
        >
          <span className="whitespace-pre-line leading-snug">
            {data.shape === 'interface' ? `«interface» ${data.label}` : data.label}
          </span>
        </div>
        {isEntity ? (
          <table className="min-h-[32px] w-full border-t border-[var(--cs-border)] text-left text-[11px] leading-5">
            <thead>
              <tr className="border-b border-[var(--cs-border)] text-[10px] uppercase tracking-wide opacity-60">
                <th className="px-2 py-1 font-medium">Name</th>
                <th className="px-2 py-1 font-medium">Type</th>
                <th className="px-2 py-1 font-medium">Key</th>
              </tr>
            </thead>
            <tbody>
              {entityRows.length > 0 ? (
                entityRows.map((row, i) => (
                  <tr key={`a-${i}`} className="border-b border-[var(--cs-border)]/60 last:border-b-0">
                    <td className="px-2 py-0.5 font-medium">{row.name}</td>
                    <td className="px-2 py-0.5 opacity-80">{row.datatype || '—'}</td>
                    <td className="px-2 py-0.5 font-semibold text-[var(--cs-accent)]">
                      {row.keys || ''}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="px-2 py-2 opacity-40">
                    No attributes
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <ul className="min-h-[32px] border-t border-[var(--cs-border)] px-3 py-2 text-xs leading-5">
            {attrs.length > 0 ? (
              attrs.map((a, i) => <li key={`a-${i}`}>{a || ' '}</li>)
            ) : (
              <li className="opacity-40">No attributes</li>
            )}
          </ul>
        )}
        {(data.shape === 'class' || data.shape === 'interface') && (
          <ul className="min-h-[32px] border-t border-[var(--cs-border)] px-3 py-2 text-xs leading-5">
            {methods.length > 0 ? (
              methods.map((m, i) => <li key={`m-${i}`}>{m || ' '}</li>)
            ) : (
              <li className="opacity-40">No methods</li>
            )}
          </ul>
        )}
      </div>
    </div>
  )
}

export function SketchNodeView({ id, data, selected }: NodeProps<SketchFlowNode>) {
  const updateInternals = useUpdateNodeInternals()
  const focus = useNodeFocus(id)
  const related = focus === 'related'
  const dimmed = focus === 'dimmed'

  useLayoutEffect(() => {
    updateInternals(id)
  }, [
    id,
    updateInternals,
    data.label,
    data.labelAlignX,
    data.labelAlignY,
    data.attributes?.join('\n'),
    data.methods?.join('\n'),
    data.shape,
  ])

  const ax = resolveLabelAlignX(data)
  const ay = resolveLabelAlignY(data)
  const textAlign = labelTextAlignClass(ax)

  if (data.shape === 'decision') {
    return (
      <div className="relative h-[96px] w-[96px]" style={mergeDimStyle(dimmed)}>
        <div
          className="absolute left-1/2 top-1/2 flex h-[64px] w-[64px] -translate-x-1/2 -translate-y-1/2 rotate-45 items-center justify-center shadow-md"
          style={{
            background: data.color,
            outline: nodeOutlineStyle(selected, related, '1px solid rgba(0,0,0,0.2)'),
          }}
        >
          <span
            className={`-rotate-45 whitespace-pre-line px-1 text-xs font-medium leading-snug text-[var(--cs-on-shape)] ${textAlign}`}
          >
            {data.label}
          </span>
        </div>
        <SidePortHandles nodeId={id} />
      </div>
    )
  }

  if (data.shape === 'startEnd' || data.shape === 'connector') {
    return (
      <div className="h-full w-full" style={mergeDimStyle(dimmed)}>
        <NodeChrome
          nodeId={id}
          data={data}
          selected={selected}
          related={related}
          className="rounded-full font-medium"
        >
          <span className="whitespace-pre-line leading-snug">{data.label}</span>
        </NodeChrome>
      </div>
    )
  }

  if (data.shape === 'database') {
    return (
      <div className="h-full w-full" style={mergeDimStyle(dimmed)}>
        <DatabaseCylinder id={id} data={data} selected={selected} related={related} />
      </div>
    )
  }

  if (data.shape === 'cloud') {
    return (
      <div className="h-full w-full" style={mergeDimStyle(dimmed)}>
        <NodeChrome
          nodeId={id}
          data={data}
          selected={selected}
          related={related}
          className="rounded-[40%] font-medium"
        >
          <span className="whitespace-pre-line leading-snug">{data.label}</span>
        </NodeChrome>
      </div>
    )
  }

  if (data.shape === 'group') {
    return (
      <div
        data-shape="group"
        className={`relative flex h-full min-h-[160px] w-full min-w-[240px] flex-col rounded-lg border-2 border-dashed p-3 text-xs ${labelFlexColClasses(ax, ay)}`}
        style={mergeDimStyle(dimmed, {
          borderColor: data.color,
          background: `${data.color}33`,
          color: 'var(--cs-text)',
          outline: nodeOutlineStyle(selected, related),
        })}
      >
        <GridResizer selected={selected} minWidth={gridUnits(12)} minHeight={gridUnits(8)} />
        <SidePortHandles nodeId={id} />
        <div
          className={`pointer-events-none w-full whitespace-pre-line font-medium leading-snug opacity-90 ${textAlign}`}
        >
          {data.label}
        </div>
      </div>
    )
  }

  if (data.shape === 'entity' || data.shape === 'class' || data.shape === 'interface') {
    return (
      <div className="h-full w-full" style={mergeDimStyle(dimmed)}>
        <AttributeCard id={id} data={data} selected={selected} related={related} />
      </div>
    )
  }

  return (
    <div className="h-full w-full" style={mergeDimStyle(dimmed)}>
      <NodeChrome
        nodeId={id}
        data={data}
        selected={selected}
        related={related}
        className="rounded-md font-medium"
      >
        <div className="whitespace-pre-line leading-snug">{data.label}</div>
        {data.subtitle ? <div className="text-[11px] opacity-80">{data.subtitle}</div> : null}
      </NodeChrome>
    </div>
  )
}

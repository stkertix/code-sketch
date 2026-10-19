import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionMode,
  Controls,
  MiniMap,
  PanOnScrollMode,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type IsValidConnection,
  type OnSelectionChangeParams,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, type DragEvent, type PointerEvent } from 'react'
import { blurActiveTextEditor } from '@/canvas/useKeyboardShortcuts'
import { SketchEdge as SketchEdgeView } from '@/canvas/edges/SketchEdge'
import { Icon } from '@/app/shell/Icon'
import { SketchNodeView } from '@/canvas/nodes/SketchNode'
import { GRID_SIZE } from '@/diagram/grid'
import { DEFAULT_EDGE_TYPE } from '@/diagram/edges'
import { useDiagramStore } from '@/diagram/store'
import { useThemeStore } from '@/app/theme/store'
import { useUiStore } from '@/app/ui/store'
import type { ShapeKind, SketchEdge, SketchNode } from '@/diagram/types'

const nodeTypes = { sketch: SketchNodeView }
const edgeTypes = {
  smoothstep: SketchEdgeView,
  orthogonal: SketchEdgeView,
  step: SketchEdgeView,
  default: SketchEdgeView,
  straight: SketchEdgeView,
}

function CanvasInner() {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition, setViewport, fitView } = useReactFlow()

  const nodes = useDiagramStore((s) => s.nodes)
  const edges = useDiagramStore((s) => s.edges)
  const diagramType = useDiagramStore((s) => s.diagramType)
  const viewport = useDiagramStore((s) => s.viewport)
  const onNodesChange = useDiagramStore((s) => s.onNodesChange)
  const onEdgesChange = useDiagramStore((s) => s.onEdgesChange)
  const onConnect = useDiagramStore((s) => s.onConnect)
  const onReconnect = useDiagramStore((s) => s.onReconnect)
  const addNodeAt = useDiagramStore((s) => s.addNodeAt)
  const setSelection = useDiagramStore((s) => s.setSelection)
  const setStoreViewport = useDiagramStore((s) => s.setViewport)
  const takeSnapshot = useDiagramStore((s) => s.takeSnapshot)
  const persistDraft = useDiagramStore((s) => s.persistDraft)
  const snapNodesToGroup = useDiagramStore((s) => s.snapNodesToGroup)
  const loadToken = useDiagramStore((s) => s.loadToken)
  const fitViewToken = useDiagramStore((s) => s.fitViewToken)
  const theme = useThemeStore((s) => s.theme)
  const showDotGrid = useUiStore((s) => s.showDotGrid)

  const gridColor = useMemo(() => {
    void theme
    return (
      getComputedStyle(document.documentElement).getPropertyValue('--cs-grid').trim() || '#1c2230'
    )
  }, [theme])

  useEffect(() => {
    if (loadToken === 0) return
    if (nodes.length > 0 && viewport.x === 0 && viewport.y === 0 && viewport.zoom === 1) {
      requestAnimationFrame(() => fitView({ padding: 0.2, duration: 200 }))
    } else {
      void setViewport(viewport)
    }
    // Sync viewport only when a document is loaded/imported
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadToken])

  useEffect(() => {
    if (fitViewToken === 0) return
    requestAnimationFrame(() => fitView({ padding: 0.2, duration: 280 }))
  }, [fitViewToken, fitView])

  const onSelectionChange = useCallback(
    ({ nodes: n, edges: e }: OnSelectionChangeParams) => {
      setSelection(n[0]?.id ?? null, e[0]?.id ?? null)
    },
    [setSelection],
  )

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      const shape = e.dataTransfer.getData('application/code-sketch-shape') as ShapeKind
      if (!shape) return
      const color = e.dataTransfer.getData('application/code-sketch-color') || undefined
      const label = e.dataTransfer.getData('application/code-sketch-label') || undefined
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      addNodeAt(shape, position, label, color)
    },
    [addNodeAt, screenToFlowPosition],
  )

  const onNodeDragStart = useCallback(() => {
    takeSnapshot()
  }, [takeSnapshot])

  const onNodeDragStop = useCallback(
    (_event: unknown, _node: SketchNode, dragged: SketchNode[]) => {
      snapNodesToGroup(dragged.map((n) => n.id))
    },
    [snapNodesToGroup],
  )

  // Return keyboard focus to the canvas so ⌘A / Delete hit diagram shortcuts
  const onCanvasPointerDown = useCallback((_e: PointerEvent<HTMLDivElement>) => {
    blurActiveTextEditor()
  }, [])

  // Prevent browser auto-scroll / paste when middle-click dragging to pan
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const blockMiddleDefault = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault()
    }
    el.addEventListener('mousedown', blockMiddleDefault)
    el.addEventListener('auxclick', blockMiddleDefault)
    return () => {
      el.removeEventListener('mousedown', blockMiddleDefault)
      el.removeEventListener('auxclick', blockMiddleDefault)
    }
  }, [])

  const empty = nodes.length === 0

  const proOptions = useMemo(() => ({ hideAttribution: true }), [])
  const defaultEdgeOptions = useMemo(
    () => ({
      type: DEFAULT_EDGE_TYPE,
      zIndex: 1000,
      style: { stroke: 'var(--cs-edge)', strokeWidth: 2 },
    }),
    [],
  )

  // Flowcharts may loop back to the same node (retry / wait). Other types keep
  // self-links off so accidental handle drops don't create confusing cycles.
  const isValidConnection = useCallback<IsValidConnection<SketchEdge>>(
    (connection) => {
      if (!connection.source || !connection.target) return false
      if (connection.source !== connection.target) return true
      if (diagramType !== 'flowchart') return false
      // Same handle on the same node is not a meaningful loop
      return (connection.sourceHandle ?? null) !== (connection.targetHandle ?? null)
    },
    [diagramType],
  )

  return (
    <div
      ref={wrapperRef}
      className="relative h-full w-full touch-none"
      onPointerDown={onCanvasPointerDown}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onReconnect={onReconnect}
        isValidConnection={isValidConnection}
        onSelectionChange={onSelectionChange}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onMoveEnd={(_, vp) => {
          setStoreViewport(vp)
          persistDraft()
        }}
        fitView={false}
        snapToGrid
        snapGrid={[GRID_SIZE, GRID_SIZE]}
        // Deletion is handled by useKeyboardShortcuts + toolbar (keeps selection stable)
        deleteKeyCode={null}
        edgesFocusable
        edgesReconnectable
        reconnectRadius={28}
        elementsSelectable
        multiSelectionKeyCode="Shift"
        selectionOnDrag
        // Design-tool navigation: left = select, middle/right = pan, scroll/trackpad = pan
        panOnDrag={[1, 2]}
        panOnScroll
        panOnScrollMode={PanOnScrollMode.Free}
        panOnScrollSpeed={0.6}
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        preventScrolling
        panActivationKeyCode="Space"
        connectionMode={ConnectionMode.Loose}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={{ stroke: 'var(--cs-edge)', strokeWidth: 2 }}
        proOptions={proOptions}
        defaultEdgeOptions={defaultEdgeOptions}
      >
        {showDotGrid ? (
          <Background variant={BackgroundVariant.Lines} gap={GRID_SIZE} size={1} color={gridColor} />
        ) : null}
        <Controls />
        <MiniMap
          nodeColor={(n) => (n as SketchNode).data?.color ?? '#5b8def'}
          maskColor="rgba(15,18,25,0.7)"
        />
      </ReactFlow>

      {empty ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="max-w-md rounded-lg border border-[var(--cs-border)] bg-[var(--cs-surface)]/90 px-6 py-5 text-center shadow-lg backdrop-blur">
            <Icon name="draw-square" className="mb-3 text-2xl text-[var(--cs-accent)]" />
            <h2 className="mb-2 text-lg font-semibold">Start sketching</h2>
            <p className="text-sm text-[var(--cs-muted)]">
              Drag shapes from the left palette, connect them on the canvas, or import Mermaid
              syntax from the toolbar.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function DiagramCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  )
}

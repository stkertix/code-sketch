import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type Viewport,
  addEdge,
  reconnectEdge,
} from '@xyflow/react'
import { create } from 'zustand'
import { createEmptyDocument, loadDraft, saveDraft } from '@/diagram/document'
import { DEFAULT_ENTITY_ATTRIBUTES } from '@/diagram/entityAttributes'
import {
  DEFAULT_EDGE_TYPE,
  inferMarkerKind,
  type EdgeMarkerKind,
  type SketchEdgeData,
} from '@/diagram/edges'
import { DEFAULT_ENTITY_SIZE, DEFAULT_GROUP_SIZE, GRID_SIZE, snapToGrid } from '@/diagram/grid'
import {
  applyGroupSnap,
  applyGroupSnapMany,
  detachOrphans,
  orderNodesParentsFirst,
} from '@/diagram/grouping'
import { toDedicatedHandle, withDedicatedHandles } from '@/diagram/handles'
import { cloneSnapshot, pushHistory, type Snapshot } from '@/diagram/history'
import { autoLayoutGraph } from '@/diagram/autoLayout'
import { createId } from '@/diagram/ids'
import type {
  DiagramType,
  ShapeKind,
  SketchDocument,
  SketchEdge,
  SketchNode,
  SketchNodeData,
} from '@/diagram/types'

type UpdateOpts = { skipHistory?: boolean }

type DiagramState = {
  name: string
  diagramType: DiagramType
  nodes: SketchNode[]
  edges: SketchEdge[]
  viewport: Viewport
  past: Snapshot[]
  future: Snapshot[]
  selectedNodeId: string | null
  selectedEdgeId: string | null
  hydrated: boolean
  loadToken: number
  /** Bumped after auto-layout so the canvas can fitView. */
  fitViewToken: number

  hydrate: () => void
  getDocument: () => SketchDocument
  loadDocument: (doc: SketchDocument) => void
  setName: (name: string) => void
  setDiagramType: (type: DiagramType) => void
  setViewport: (viewport: Viewport) => void
  onNodesChange: (changes: NodeChange<SketchNode>[]) => void
  onEdgesChange: (changes: EdgeChange<SketchEdge>[]) => void
  onConnect: (connection: Connection) => void
  onReconnect: (oldEdge: SketchEdge, connection: Connection) => void
  takeSnapshot: () => void
  undo: () => void
  redo: () => void
  addNodeAt: (shape: ShapeKind, position: { x: number; y: number }, label?: string, color?: string) => void
  updateSelectedNode: (patch: Partial<SketchNodeData>, opts?: UpdateOpts) => void
  setSelectedNodeShape: (shape: ShapeKind, opts?: UpdateOpts) => void
  updateSelectedEdge: (
    patch: Partial<
      Pick<
        SketchEdge,
        'label' | 'type' | 'style' | 'data' | 'markerStart' | 'markerEnd' | 'sourceHandle' | 'targetHandle'
      >
    >,
    opts?: UpdateOpts,
  ) => void
  setEdgeMarkers: (
    ends: { sourceMarker?: EdgeMarkerKind; targetMarker?: EdgeMarkerKind },
    opts?: UpdateOpts,
  ) => void
  setEdgeLabelT: (edgeId: string, labelT: number, opts?: UpdateOpts) => void
  setSelection: (nodeId: string | null, edgeId: string | null) => void
  selectAll: () => void
  deleteSelected: () => void
  duplicateSelected: () => void
  alignSelected: (axis: 'x' | 'y') => void
  autoLayout: () => void
  bringToFront: () => void
  sendToBack: () => void
  snapNodeToGroup: (nodeId: string) => void
  snapNodesToGroup: (nodeIds: string[]) => void
  replaceGraph: (nodes: SketchNode[], edges: SketchEdge[], diagramType?: DiagramType) => void
  persistDraft: () => void
}

function selectedNodeIds(state: {
  nodes: SketchNode[]
  selectedNodeId: string | null
}): Set<string> {
  const ids = new Set(state.nodes.filter((n) => n.selected).map((n) => n.id))
  if (state.selectedNodeId) ids.add(state.selectedNodeId)
  return ids
}

function selectedEdgeIds(state: {
  edges: SketchEdge[]
  selectedEdgeId: string | null
}): Set<string> {
  const ids = new Set(state.edges.filter((e) => e.selected).map((e) => e.id))
  if (state.selectedEdgeId) ids.add(state.selectedEdgeId)
  return ids
}

function zOf(el: { zIndex?: number }): number {
  return el.zIndex ?? 0
}

const defaultDoc = createEmptyDocument()

function withMarkers(
  edge: SketchEdge,
  sourceMarker: EdgeMarkerKind,
  targetMarker: EdgeMarkerKind,
): SketchEdge {
  const data: SketchEdgeData = {
    ...edge.data,
    sourceMarker,
    targetMarker,
  }
  return {
    ...edge,
    data,
    // Drawn by OrthogonalEdge (RF per-edge SVG can't resolve external marker urls)
    markerStart: undefined,
    markerEnd: undefined,
  }
}

function normalizeEdges(edges: SketchEdge[]): SketchEdge[] {
  return edges.map((e) => {
    // Orthogonal (smoothstep) is the default. Keep only explicit straight/step/bezier choices.
    const type =
      e.type === 'straight' || e.type === 'step' || e.type === 'default'
        ? e.type
        : DEFAULT_EDGE_TYPE

    // Prefer explicit data; only infer target from legacy RF marker objects
    const sourceMarker: EdgeMarkerKind = e.data?.sourceMarker ?? 'none'
    const targetMarker: EdgeMarkerKind =
      e.data?.targetMarker ??
      (e.markerEnd ? inferMarkerKind(e.markerEnd, 'arrow') : 'arrow')

    return withDedicatedHandles(
      withMarkers(
        {
          ...e,
          type,
          // Keep edges above nodes within the RF edge layer
          zIndex: e.zIndex ?? 1000,
          style: { stroke: 'var(--cs-edge)', strokeWidth: 2, ...e.style },
        },
        sourceMarker,
        targetMarker,
      ),
    )
  })
}

/**
 * Drop locked height on attribute cards so they reflow with content.
 * Also clear extent:'parent' (traps nodes inside groups) and keep parents first.
 */
function normalizeNodes(nodes: SketchNode[]): SketchNode[] {
  const cleaned = nodes.map((n) => {
    let next = n
    // Legacy docs may have extent:'parent', which prevents dragging out of a group
    if (n.extent === 'parent') {
      next = { ...next, extent: undefined }
    }
    const shape = next.data?.shape
    if (shape !== 'entity' && shape !== 'class' && shape !== 'interface') return next
    if (!next.style || !('height' in next.style)) return next
    const { height: _h, ...rest } = next.style
    return { ...next, style: rest, height: undefined, measured: undefined }
  })
  return orderNodesParentsFirst(cleaned)
}

function defaultData(shape: ShapeKind, label: string, color: string): SketchNodeData {
  const base: SketchNodeData = { label, shape, color }
  if (shape === 'entity') {
    return { ...base, attributes: [...DEFAULT_ENTITY_ATTRIBUTES] }
  }
  if (shape === 'class' || shape === 'interface') {
    return {
      ...base,
      attributes: shape === 'class' ? ['+ field: type'] : [],
      methods: shape === 'class' ? ['+ method(): void'] : ['+ method(): void'],
    }
  }
  return base
}

export const useDiagramStore = create<DiagramState>((set, get) => ({
  name: defaultDoc.name,
  diagramType: defaultDoc.diagramType,
  nodes: [],
  edges: [],
  viewport: defaultDoc.viewport,
  past: [],
  future: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  hydrated: false,
  loadToken: 0,
  fitViewToken: 0,

  hydrate: () => {
    if (get().hydrated) return
    const draft = loadDraft()
    if (draft) {
      set({
        name: draft.name,
        diagramType: draft.diagramType,
        nodes: normalizeNodes(draft.nodes),
        edges: normalizeEdges(draft.edges),
        viewport: draft.viewport,
        hydrated: true,
        loadToken: get().loadToken + 1,
        past: [],
        future: [],
      })
    } else {
      set({ hydrated: true, loadToken: get().loadToken + 1 })
    }
  },

  getDocument: () => {
    const s = get()
    return {
      version: 1,
      name: s.name,
      diagramType: s.diagramType,
      nodes: s.nodes,
      edges: s.edges,
      viewport: s.viewport,
    }
  },

  loadDocument: (doc) => {
    set({
      name: doc.name,
      diagramType: doc.diagramType,
      nodes: normalizeNodes(doc.nodes),
      edges: normalizeEdges(doc.edges),
      viewport: doc.viewport,
      past: [],
      future: [],
      selectedNodeId: null,
      selectedEdgeId: null,
      loadToken: get().loadToken + 1,
    })
    get().persistDraft()
  },

  setName: (name) => {
    set({ name })
    get().persistDraft()
  },

  setDiagramType: (diagramType) => {
    set({ diagramType })
    get().persistDraft()
  },

  setViewport: (viewport) => set({ viewport }),

  takeSnapshot: () => {
    const { nodes, edges, past } = get()
    set({ past: pushHistory(past, { nodes, edges }), future: [] })
  },

  onNodesChange: (changes) => {
    const structural = changes.some(
      (c) => c.type === 'remove' || c.type === 'add' || c.type === 'replace',
    )
    if (structural) get().takeSnapshot()
    // Keep resized (and dragged) geometry on the grid
    const snapped = changes.map((c) => {
      if (c.type === 'dimensions' && c.dimensions) {
        return {
          ...c,
          dimensions: {
            width: Math.max(GRID_SIZE, snapToGrid(c.dimensions.width)),
            height: Math.max(GRID_SIZE, snapToGrid(c.dimensions.height)),
          },
        }
      }
      return c
    })
    set({ nodes: applyNodeChanges(snapped, get().nodes) })
    get().persistDraft()
  },

  onEdgesChange: (changes) => {
    const structural = changes.some(
      (c) => c.type === 'remove' || c.type === 'add' || c.type === 'replace',
    )
    if (structural) get().takeSnapshot()
    set({ edges: applyEdgeChanges(changes, get().edges) })
    get().persistDraft()
  },

  onConnect: (connection) => {
    get().takeSnapshot()
    const id = createId('e')
    const edge = withDedicatedHandles(
      withMarkers(
        {
          ...connection,
          id,
          type: DEFAULT_EDGE_TYPE,
          zIndex: 1000,
          style: { stroke: 'var(--cs-edge)', strokeWidth: 2 },
          sourceHandle: toDedicatedHandle(connection.sourceHandle, id, 'right'),
          targetHandle: toDedicatedHandle(connection.targetHandle, id, 'left'),
        } as SketchEdge,
        'none',
        'arrow',
      ),
    )
    set({ edges: addEdge(edge, get().edges) })
    get().persistDraft()
  },

  onReconnect: (oldEdge, connection) => {
    get().takeSnapshot()
    const id = oldEdge.id
    const next: Connection = {
      ...connection,
      sourceHandle: toDedicatedHandle(connection.sourceHandle, id, 'right'),
      targetHandle: toDedicatedHandle(connection.targetHandle, id, 'left'),
    }
    set({ edges: reconnectEdge(oldEdge, next, get().edges).map(withDedicatedHandles) })
    get().persistDraft()
  },

  undo: () => {
    const { past, nodes, edges, future } = get()
    if (past.length === 0) return
    const previous = past[past.length - 1]
    set({
      past: past.slice(0, -1),
      future: [cloneSnapshot({ nodes, edges }), ...future],
      nodes: previous.nodes,
      edges: previous.edges,
    })
    get().persistDraft()
  },

  redo: () => {
    const { past, nodes, edges, future } = get()
    if (future.length === 0) return
    const next = future[0]
    set({
      future: future.slice(1),
      past: pushHistory(past, { nodes, edges }),
      nodes: next.nodes,
      edges: next.edges,
    })
    get().persistDraft()
  },

  addNodeAt: (shape, position, label, color) => {
    get().takeSnapshot()
    const text = label ?? shape.charAt(0).toUpperCase() + shape.slice(1)
    const fill = color ?? '#5b8def'
    const node: SketchNode = {
      id: createId('n'),
      type: 'sketch',
      position,
      // Groups sit behind other shapes by default
      zIndex: shape === 'group' ? 0 : 1,
      data: defaultData(shape, text, fill),
      style:
        shape === 'group'
          ? { width: DEFAULT_GROUP_SIZE.width, height: DEFAULT_GROUP_SIZE.height }
          : shape === 'entity' || shape === 'class' || shape === 'interface'
            ? { width: DEFAULT_ENTITY_SIZE.width }
            : undefined,
    }
    const withNode = [...get().nodes, node]
    const snapped = shape === 'group' ? withNode : applyGroupSnap(node, withNode)
    set({ nodes: snapped, selectedNodeId: node.id, selectedEdgeId: null })
    get().persistDraft()
  },

  updateSelectedNode: (patch, opts) => {
    const id = get().selectedNodeId
    if (!id) return
    if (!opts?.skipHistory) get().takeSnapshot()
    set({
      nodes: get().nodes.map((n) => {
        if (n.id !== id) return n
        const next = { ...n, data: { ...n.data, ...patch } }
        // Let entity/class/interface height reflow with attribute/method content
        if (
          (patch.attributes !== undefined || patch.methods !== undefined) &&
          (n.data.shape === 'entity' ||
            n.data.shape === 'class' ||
            n.data.shape === 'interface') &&
          n.style &&
          'height' in n.style
        ) {
          const { height: _h, ...rest } = n.style
          next.style = rest
          next.height = undefined
          next.measured = undefined
        }
        return next
      }),
    })
    get().persistDraft()
  },

  setSelectedNodeShape: (shape, opts) => {
    const id = get().selectedNodeId
    if (!id) return
    if (!opts?.skipHistory) get().takeSnapshot()
    set({
      nodes: get().nodes.map((n) => {
        if (n.id !== id) return n
        const seeded = defaultData(shape, n.data.label, n.data.color)
        const data: SketchNodeData = {
          ...seeded,
          label: n.data.label,
          color: n.data.color,
          subtitle: n.data.subtitle,
          // Keep existing attribute/method lines when staying in card-like shapes
          attributes:
            shape === 'entity' || shape === 'class' || shape === 'interface'
              ? (n.data.attributes ?? seeded.attributes)
              : undefined,
          methods:
            shape === 'class' || shape === 'interface'
              ? (n.data.methods ?? seeded.methods)
              : undefined,
        }
        const style =
          shape === 'group'
            ? { width: DEFAULT_GROUP_SIZE.width, height: DEFAULT_GROUP_SIZE.height }
            : shape === 'entity' || shape === 'class' || shape === 'interface'
              ? { width: DEFAULT_ENTITY_SIZE.width }
              : undefined
        return {
          ...n,
          data,
          style,
          width: undefined,
          height: undefined,
          measured: undefined,
        }
      }),
    })
    get().persistDraft()
  },

  updateSelectedEdge: (patch, opts) => {
    const id = get().selectedEdgeId
    if (!id) return
    if (!opts?.skipHistory) get().takeSnapshot()
    set({
      edges: get().edges.map((e) => {
        if (e.id !== id) return e
        const next = { ...e, ...patch }
        if ('sourceHandle' in patch && patch.sourceHandle != null) {
          next.sourceHandle = toDedicatedHandle(patch.sourceHandle, id, 'right')
        }
        if ('targetHandle' in patch && patch.targetHandle != null) {
          next.targetHandle = toDedicatedHandle(patch.targetHandle, id, 'left')
        }
        return next
      }),
    })
    get().persistDraft()
  },

  setEdgeMarkers: (ends, opts) => {
    const id = get().selectedEdgeId
    if (!id) return
    if (!opts?.skipHistory) get().takeSnapshot()
    set({
      edges: get().edges.map((e) => {
        if (e.id !== id) return e
        const sourceMarker = ends.sourceMarker ?? e.data?.sourceMarker ?? 'none'
        const targetMarker = ends.targetMarker ?? e.data?.targetMarker ?? 'arrow'
        return withMarkers(e, sourceMarker, targetMarker)
      }),
    })
    get().persistDraft()
  },

  setEdgeLabelT: (edgeId, labelT, opts) => {
    if (!opts?.skipHistory) get().takeSnapshot()
    set({
      edges: get().edges.map((e) =>
        e.id === edgeId
          ? { ...e, data: { ...e.data, labelT } }
          : e,
      ),
    })
    if (!opts?.skipHistory) get().persistDraft()
  },

  snapNodeToGroup: (nodeId) => {
    get().snapNodesToGroup([nodeId])
  },

  snapNodesToGroup: (nodeIds) => {
    if (nodeIds.length === 0) return
    const next = applyGroupSnapMany(nodeIds, get().nodes)
    if (next === get().nodes) return
    set({ nodes: next })
    get().persistDraft()
  },

  setSelection: (nodeId, edgeId) => set({ selectedNodeId: nodeId, selectedEdgeId: edgeId }),

  selectAll: () => {
    const { nodes, edges } = get()
    if (nodes.length === 0 && edges.length === 0) return
    set({
      nodes: nodes.map((n) => ({ ...n, selected: true })),
      edges: edges.map((e) => ({ ...e, selected: true })),
      selectedNodeId: nodes[0]?.id ?? null,
      selectedEdgeId: edges[0]?.id ?? null,
    })
  },

  deleteSelected: () => {
    const { selectedNodeId, selectedEdgeId, nodes, edges } = get()
    const nodeIds = new Set(nodes.filter((n) => n.selected).map((n) => n.id))
    const edgeIds = new Set(edges.filter((e) => e.selected).map((e) => e.id))
    if (selectedNodeId) nodeIds.add(selectedNodeId)
    if (selectedEdgeId) edgeIds.add(selectedEdgeId)
    if (nodeIds.size === 0 && edgeIds.size === 0) return

    get().takeSnapshot()
    // Detach surviving children of deleted groups so they don't jump to relative coords
    set({
      nodes: orderNodesParentsFirst(detachOrphans(nodes, nodeIds)),
      edges: edges.filter(
        (e) =>
          !edgeIds.has(e.id) && !nodeIds.has(e.source) && !nodeIds.has(e.target),
      ),
      selectedNodeId: null,
      selectedEdgeId: null,
    })
    get().persistDraft()
  },

  duplicateSelected: () => {
    const { selectedNodeId, nodes } = get()
    const source =
      nodes.find((n) => n.selected) ?? nodes.find((n) => n.id === selectedNodeId)
    if (!source) return
    get().takeSnapshot()
    const copy: SketchNode = {
      ...structuredClone(source),
      id: createId('n'),
      position: { x: source.position.x + 40, y: source.position.y + 40 },
      selected: true,
    }
    set({
      nodes: [...nodes.map((n) => ({ ...n, selected: false })), copy],
      selectedNodeId: copy.id,
    })
    get().persistDraft()
  },

  alignSelected: (axis) => {
    const selected = get().nodes.filter((n) => n.selected)
    if (selected.length < 2) return
    get().takeSnapshot()
    const values = selected.map((n) => n.position[axis])
    const target = Math.min(...values)
    const ids = new Set(selected.map((n) => n.id))
    set({
      nodes: get().nodes.map((n) =>
        ids.has(n.id) ? { ...n, position: { ...n.position, [axis]: target } } : n,
      ),
    })
    get().persistDraft()
  },

  autoLayout: () => {
    const { nodes, edges, diagramType } = get()
    if (nodes.length === 0) return
    get().takeSnapshot()
    const laid = autoLayoutGraph(nodes, edges, diagramType)
    set({
      nodes: laid.nodes,
      edges: laid.edges,
      fitViewToken: get().fitViewToken + 1,
    })
    get().persistDraft()
  },

  bringToFront: () => {
    const state = get()
    const nodeIds = selectedNodeIds(state)
    const edgeIds = selectedEdgeIds(state)
    if (nodeIds.size === 0 && edgeIds.size === 0) return

    get().takeSnapshot()
    const { nodes, edges } = get()

    const maxNodeZ = nodes.reduce((m, n) => Math.max(m, zOf(n)), 0)
    const maxEdgeZ = edges.reduce((m, e) => Math.max(m, zOf(e)), 0)

    const selNodes = nodes
      .filter((n) => nodeIds.has(n.id))
      .sort((a, b) => zOf(a) - zOf(b) || a.id.localeCompare(b.id))
    const selEdges = edges
      .filter((e) => edgeIds.has(e.id))
      .sort((a, b) => zOf(a) - zOf(b) || a.id.localeCompare(b.id))

    const nodeZ = new Map(selNodes.map((n, i) => [n.id, maxNodeZ + 1 + i]))
    const edgeZ = new Map(selEdges.map((e, i) => [e.id, maxEdgeZ + 1 + i]))

    set({
      nodes: nodes.map((n) => (nodeZ.has(n.id) ? { ...n, zIndex: nodeZ.get(n.id)! } : n)),
      edges: edges.map((e) => (edgeZ.has(e.id) ? { ...e, zIndex: edgeZ.get(e.id)! } : e)),
    })
    get().persistDraft()
  },

  sendToBack: () => {
    const state = get()
    const nodeIds = selectedNodeIds(state)
    const edgeIds = selectedEdgeIds(state)
    if (nodeIds.size === 0 && edgeIds.size === 0) return

    get().takeSnapshot()
    const { nodes, edges } = get()

    const minNodeZ = nodes.reduce((m, n) => Math.min(m, zOf(n)), 0)
    const minEdgeZ = edges.reduce((m, e) => Math.min(m, zOf(e)), 0)

    const selNodes = nodes
      .filter((n) => nodeIds.has(n.id))
      .sort((a, b) => zOf(a) - zOf(b) || a.id.localeCompare(b.id))
    const selEdges = edges
      .filter((e) => edgeIds.has(e.id))
      .sort((a, b) => zOf(a) - zOf(b) || a.id.localeCompare(b.id))

    const nodeZ = new Map(
      selNodes.map((n, i) => [n.id, minNodeZ - selNodes.length + i]),
    )
    const edgeZ = new Map(
      selEdges.map((e, i) => [e.id, minEdgeZ - selEdges.length + i]),
    )

    set({
      nodes: nodes.map((n) => (nodeZ.has(n.id) ? { ...n, zIndex: nodeZ.get(n.id)! } : n)),
      edges: edges.map((e) => (edgeZ.has(e.id) ? { ...e, zIndex: edgeZ.get(e.id)! } : e)),
    })
    get().persistDraft()
  },

  replaceGraph: (nodes, edges, diagramType) => {
    get().takeSnapshot()
    set({
      nodes: normalizeNodes(nodes),
      edges: normalizeEdges(edges),
      diagramType: diagramType ?? get().diagramType,
      selectedNodeId: null,
      selectedEdgeId: null,
      loadToken: get().loadToken + 1,
      viewport: { x: 0, y: 0, zoom: 1 },
    })
    get().persistDraft()
  },

  persistDraft: () => {
    if (!get().hydrated) return
    saveDraft(get().getDocument())
  },
}))

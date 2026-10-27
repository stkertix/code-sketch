import { createContext, useContext, useMemo, type CSSProperties, type ReactNode } from 'react'
import { useDiagramStore } from '@/diagram/store'

type HighlightSets = {
  /** True when something is selected and focus/dim should apply. */
  active: boolean
  /** Selected node ids. */
  selectedNodes: ReadonlySet<string>
  /** Edges incident to a selected node, or themselves selected. */
  edges: ReadonlySet<string>
  /** Nodes adjacent to a selected node/edge (excludes the primary selection). */
  nodes: ReadonlySet<string>
}

const EMPTY: HighlightSets = {
  active: false,
  selectedNodes: new Set(),
  edges: new Set(),
  nodes: new Set(),
}

const ConnectionHighlightContext = createContext<HighlightSets>(EMPTY)

/** Derive related edges/nodes from the current React Flow selection. */
export function ConnectionHighlightProvider({ children }: { children: ReactNode }) {
  const nodes = useDiagramStore((s) => s.nodes)
  const edges = useDiagramStore((s) => s.edges)

  const value = useMemo(() => {
    const selectedNodes = new Set<string>()
    for (const n of nodes) {
      if (n.selected) selectedNodes.add(n.id)
    }
    const selectedEdges = new Set<string>()
    for (const e of edges) {
      if (e.selected) selectedEdges.add(e.id)
    }

    if (selectedNodes.size === 0 && selectedEdges.size === 0) return EMPTY

    const relatedEdges = new Set<string>()
    const relatedNodes = new Set<string>()

    for (const e of edges) {
      const touchNode = selectedNodes.has(e.source) || selectedNodes.has(e.target)
      const touchEdge = selectedEdges.has(e.id)
      if (!touchNode && !touchEdge) continue
      relatedEdges.add(e.id)
      if (!selectedNodes.has(e.source)) relatedNodes.add(e.source)
      if (!selectedNodes.has(e.target)) relatedNodes.add(e.target)
    }

    return {
      active: true,
      selectedNodes,
      edges: relatedEdges,
      nodes: relatedNodes,
    }
  }, [nodes, edges])

  return (
    <ConnectionHighlightContext.Provider value={value}>
      {children}
    </ConnectionHighlightContext.Provider>
  )
}

export type FocusKind = 'normal' | 'selected' | 'related' | 'dimmed'

export function useNodeFocus(nodeId: string): FocusKind {
  const ctx = useContext(ConnectionHighlightContext)
  if (!ctx.active) return 'normal'
  if (ctx.selectedNodes.has(nodeId)) return 'selected'
  if (ctx.nodes.has(nodeId)) return 'related'
  return 'dimmed'
}

export function useEdgeFocus(edgeId: string): FocusKind {
  const ctx = useContext(ConnectionHighlightContext)
  if (!ctx.active) return 'normal'
  // Selected edges are in the related set; RF also passes `selected` prop
  if (ctx.edges.has(edgeId)) return 'related'
  return 'dimmed'
}

/** @deprecated prefer useNodeFocus */
export function useRelatedNode(nodeId: string): boolean {
  return useNodeFocus(nodeId) === 'related'
}

/** @deprecated prefer useEdgeFocus */
export function useRelatedEdge(edgeId: string): boolean {
  return useEdgeFocus(edgeId) === 'related'
}

/** Outline for primary selection vs related (connected) highlight. */
export function nodeOutlineStyle(
  selected: boolean | undefined,
  related: boolean,
  idle?: string,
): string | undefined {
  if (selected) return '2px solid var(--cs-accent)'
  if (related) return '2px solid color-mix(in srgb, var(--cs-accent) 65%, transparent)'
  return idle
}

/** Grey-out style for nodes/edges outside the selection neighborhood. */
export function dimStyle(dimmed: boolean): CSSProperties | undefined {
  if (!dimmed) return undefined
  return {
    opacity: 0.28,
    filter: 'grayscale(0.55)',
    transition: 'opacity 140ms ease, filter 140ms ease',
  }
}

export function mergeDimStyle(
  dimmed: boolean,
  base?: CSSProperties,
): CSSProperties | undefined {
  const dim = dimStyle(dimmed)
  if (!dim && !base) return undefined
  return { ...base, ...dim }
}

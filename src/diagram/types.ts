import type { Edge, Node, Viewport } from '@xyflow/react'
import type { SketchEdgeData } from '@/canvas/edges/markers'

export type DiagramType = 'flowchart' | 'architecture' | 'erd' | 'uml'

export type ShapeKind =
  | 'process'
  | 'decision'
  | 'startEnd'
  | 'connector'
  | 'box'
  | 'service'
  | 'database'
  | 'cloud'
  | 'group'
  | 'entity'
  | 'class'
  | 'interface'

export type SketchNodeData = {
  label: string
  shape: ShapeKind
  color: string
  subtitle?: string
  attributes?: string[]
  methods?: string[]
}

export type SketchNode = Node<SketchNodeData>
export type SketchEdge = Edge<SketchEdgeData>

export type SketchDocument = {
  version: 1
  name: string
  diagramType: DiagramType
  nodes: SketchNode[]
  edges: SketchEdge[]
  viewport: Viewport
}

export type PaletteItem = {
  shape: ShapeKind
  label: string
  defaultColor: string
}

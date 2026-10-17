import type { DiagramType, PaletteItem, ShapeKind } from '@/diagram/types'

export const DIAGRAM_LABELS: Record<DiagramType, string> = {
  flowchart: 'Flowchart',
  architecture: 'Architecture',
  erd: 'Entity Relation',
  uml: 'UML Class',
}

const GROUP_ITEM: PaletteItem = {
  shape: 'group',
  label: 'Group',
  defaultColor: '#3d5a8a',
}

export const PALETTES: Record<DiagramType, PaletteItem[]> = {
  flowchart: [
    { shape: 'startEnd', label: 'Start / End', defaultColor: '#7dd3a8' },
    { shape: 'process', label: 'Process', defaultColor: '#5b8def' },
    { shape: 'decision', label: 'Decision', defaultColor: '#e8c37a' },
    { shape: 'connector', label: 'Connector', defaultColor: '#8b95a8' },
    GROUP_ITEM,
  ],
  architecture: [
    { shape: 'box', label: 'Box', defaultColor: '#5b8def' },
    { shape: 'service', label: 'Service', defaultColor: '#7dd3a8' },
    { shape: 'database', label: 'Database', defaultColor: '#e8c37a' },
    { shape: 'cloud', label: 'Cloud', defaultColor: '#8b9dff' },
    GROUP_ITEM,
  ],
  erd: [
    { shape: 'entity', label: 'Entity', defaultColor: '#5b8def' },
    GROUP_ITEM,
  ],
  uml: [
    { shape: 'class', label: 'Class', defaultColor: '#5b8def' },
    { shape: 'interface', label: 'Interface', defaultColor: '#7dd3a8' },
    GROUP_ITEM,
  ],
}

/** Default edge type for all diagrams — orthogonal (React Flow smoothstep). */
export const DEFAULT_EDGE_TYPE = 'smoothstep'

/** Unique shapes across all palettes (for inspector shape picker). */
export const ALL_SHAPE_OPTIONS: PaletteItem[] = (() => {
  const seen = new Set<string>()
  const items: PaletteItem[] = []
  for (const list of Object.values(PALETTES)) {
    for (const item of list) {
      if (seen.has(item.shape)) continue
      seen.add(item.shape)
      items.push(item)
    }
  }
  return items
})()

export function shapeLabel(shape: ShapeKind): string {
  return ALL_SHAPE_OPTIONS.find((i) => i.shape === shape)?.label ?? shape
}

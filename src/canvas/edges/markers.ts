export type EdgeMarkerKind =
  | 'none'
  | 'arrow'
  | 'arrowOpen'
  | 'dot'
  | 'circle'
  | 'zero'
  | 'one'
  | 'many'
  | 'zeroOrOne'
  | 'zeroOrMany'
  | 'oneOrMany'

export const EDGE_MARKER_OPTIONS: Array<{ value: EdgeMarkerKind; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'arrow', label: 'Arrow' },
  { value: 'arrowOpen', label: 'Open arrow' },
  { value: 'dot', label: 'Dot' },
  { value: 'circle', label: 'Circle' },
  { value: 'zero', label: 'Cardinality: zero' },
  { value: 'one', label: 'Cardinality: one' },
  { value: 'many', label: 'Cardinality: many' },
  { value: 'zeroOrOne', label: 'Cardinality: zero or one' },
  { value: 'zeroOrMany', label: 'Cardinality: zero or many' },
  { value: 'oneOrMany', label: 'Cardinality: one or many' },
]

export type EdgeLineStyle = 'solid' | 'dashed' | 'dotted'

export const EDGE_LINE_STYLE_OPTIONS: Array<{
  value: EdgeLineStyle
  label: string
}> = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
]

export function strokeDashForLineStyle(style: EdgeLineStyle | undefined): string | undefined {
  switch (style) {
    case 'dashed':
      return '8 6'
    case 'dotted':
      return '1.5 4'
    default:
      return undefined
  }
}

export type SketchEdgeData = {
  sourceMarker?: EdgeMarkerKind
  targetMarker?: EdgeMarkerKind
  lineStyle?: EdgeLineStyle
  /** Label position along the edge path, 0 = source … 1 = target. */
  labelT?: number
}

export function inferMarkerKind(
  marker: unknown,
  fallback: EdgeMarkerKind,
): EdgeMarkerKind {
  if (!marker) return 'none'
  const raw = typeof marker === 'string' ? marker : ''
  if (raw) {
    if (raw.includes('arrowOpen')) return 'arrowOpen'
    if (raw.includes('arrow')) return 'arrow'
    // Combined cardinalities first (longer matches)
    if (raw.includes('zeroOrMany') || raw.includes('zero-or-many')) return 'zeroOrMany'
    if (raw.includes('zeroOrOne') || raw.includes('zero-or-one')) return 'zeroOrOne'
    if (raw.includes('oneOrMany') || raw.includes('one-or-many')) return 'oneOrMany'
    if (raw.includes('many')) return 'many'
    if (raw.includes('one')) return 'one'
    if (raw.includes('zero')) return 'zero'
    if (raw.includes('dot')) return 'dot'
    if (raw.includes('circle')) return 'circle'
    return fallback
  }
  if (typeof marker === 'object' && marker !== null && 'type' in marker) {
    const t = String((marker as { type: string }).type)
    if (t === 'arrowclosed') return 'arrow'
    if (t === 'arrow') return 'arrowOpen'
  }
  return fallback
}

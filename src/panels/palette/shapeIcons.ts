import type { ShapeKind } from '@/diagram/types'

/** Flaticon Uicons (fi-rr-*) per palette shape */
export const SHAPE_ICONS: Record<ShapeKind, string> = {
  startEnd: 'circle',
  process: 'rectangle-horizontal',
  decision: 'diamond',
  connector: 'circle-small',
  box: 'box',
  service: 'cube',
  database: 'database',
  cloud: 'cloud',
  group: 'object-group',
  entity: 'table-list',
  class: 'square-code',
  interface: 'code-simple',
}

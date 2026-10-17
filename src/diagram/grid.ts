/** Canvas snap / background line spacing (px). */
export const GRID_SIZE = 16

export function gridUnits(n: number, grid = GRID_SIZE): number {
  return n * grid
}

export function snapToGrid(value: number, grid = GRID_SIZE): number {
  return Math.round(value / grid) * grid
}

/** Round up to the next grid multiple (never below content size). */
export function snapCeilToGrid(value: number, grid = GRID_SIZE): number {
  if (value <= 0) return grid
  return Math.ceil(value / grid) * grid
}

/**
 * Default ERD / UML card width (on-grid).
 * Height is omitted so the node grows with attributes / methods.
 */
export const DEFAULT_ENTITY_SIZE = {
  width: gridUnits(12), // 192
} as const

/** Fallback row pitch for import layouts (header + a few attribute lines). */
export const DEFAULT_ENTITY_LAYOUT_HEIGHT = gridUnits(6) // 96

export const DEFAULT_GROUP_SIZE = {
  width: gridUnits(20), // 320
  height: gridUnits(14), // 224
} as const

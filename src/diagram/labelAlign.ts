import type { LabelAlignX, LabelAlignY, SketchNodeData } from '@/diagram/types'

export const DEFAULT_LABEL_ALIGN_X: LabelAlignX = 'center'
export const DEFAULT_LABEL_ALIGN_Y: LabelAlignY = 'middle'

export const LABEL_ALIGN_X_OPTIONS: Array<{ value: LabelAlignX; label: string }> = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
]

export const LABEL_ALIGN_Y_OPTIONS: Array<{ value: LabelAlignY; label: string }> = [
  { value: 'top', label: 'Top' },
  { value: 'middle', label: 'Middle' },
  { value: 'bottom', label: 'Bottom' },
]

export function resolveLabelAlignX(data: Pick<SketchNodeData, 'labelAlignX'>): LabelAlignX {
  return data.labelAlignX ?? DEFAULT_LABEL_ALIGN_X
}

export function resolveLabelAlignY(data: Pick<SketchNodeData, 'labelAlignY'>): LabelAlignY {
  return data.labelAlignY ?? DEFAULT_LABEL_ALIGN_Y
}

/** Tailwind text-align for the label block. */
export function labelTextAlignClass(align: LabelAlignX): string {
  switch (align) {
    case 'left':
      return 'text-left'
    case 'right':
      return 'text-right'
    default:
      return 'text-center'
  }
}

/**
 * Flex classes for a column layout (`flex-col`):
 * - cross axis (items) = horizontal
 * - main axis (justify) = vertical
 */
export function labelFlexColClasses(ax: LabelAlignX, ay: LabelAlignY): string {
  const items =
    ax === 'left' ? 'items-start' : ax === 'right' ? 'items-end' : 'items-center'
  const justify =
    ay === 'top' ? 'justify-start' : ay === 'bottom' ? 'justify-end' : 'justify-center'
  return `${items} ${justify}`
}

import { getNodesBounds, getViewportForBounds } from '@xyflow/react'
import { toPng, toSvg } from 'html-to-image'
import { useDiagramStore } from '@/diagram/store'
import { downloadText } from '@/io/download'

/** Extra margin around the fitted diagram (px). */
const EXPORT_PADDING = 64

/** Cap the longest export edge so huge graphs stay within browser limits. */
const MAX_EXPORT_EDGE = 8192

function getViewportEl(): HTMLElement {
  const el = document.querySelector('.react-flow__viewport') as HTMLElement | null
  if (!el) throw new Error('Canvas viewport not found.')
  return el
}

function canvasBackground(): string {
  return (
    getComputedStyle(document.documentElement).getPropertyValue('--cs-canvas').trim() ||
    '#12151e'
  )
}

function exportFilter(node: HTMLElement): boolean {
  const skip = [
    'react-flow__controls',
    'react-flow__minimap',
    'react-flow__panel',
    'react-flow__attribution',
    'react-flow__background',
  ]
  if (node.classList?.contains('react-flow__background-pattern')) return false
  if (node.getAttribute?.('data-testid') === 'rf__background') return false
  return !skip.some((cls) => node.classList?.contains(cls))
}

/**
 * Size + transform so the exported image covers every node, not just the
 * on-screen viewport (React Flow download-image pattern).
 */
function fullDiagramExportFrame() {
  const nodes = useDiagramStore.getState().nodes
  if (nodes.length === 0) throw new Error('Nothing to export — the canvas is empty.')

  const bounds = getNodesBounds(nodes)
  let width = Math.ceil(bounds.width + EXPORT_PADDING * 2)
  let height = Math.ceil(bounds.height + EXPORT_PADDING * 2)

  const shrink = Math.min(1, MAX_EXPORT_EDGE / width, MAX_EXPORT_EDGE / height)
  width = Math.max(1, Math.ceil(width * shrink))
  height = Math.max(1, Math.ceil(height * shrink))

  // Image is larger than bounds by EXPORT_PADDING on each side; padding arg is 0
  // because that margin is already baked into width/height.
  const viewport = getViewportForBounds(bounds, width, height, 0.01, 4, 0)

  return {
    width,
    height,
    options: {
      backgroundColor: canvasBackground(),
      cacheBust: true,
      pixelRatio: 2,
      width,
      height,
      style: {
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
      },
      filter: (node: HTMLElement) => {
        if (!(node instanceof HTMLElement)) return true
        return exportFilter(node)
      },
    },
  }
}

export async function exportPng(filename = 'code-sketch.png') {
  const { options } = fullDiagramExportFrame()
  const dataUrl = await toPng(getViewportEl(), options)
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}

export async function exportSvg(filename = 'code-sketch.svg') {
  const { options } = fullDiagramExportFrame()
  const dataUrl = await toSvg(getViewportEl(), options)
  const svg = decodeURIComponent(dataUrl.split(',')[1] ?? '')
  downloadText(filename, svg, 'image/svg+xml')
}

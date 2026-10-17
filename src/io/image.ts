import { toPng, toSvg } from 'html-to-image'
import { downloadText } from '@/diagram/document'

function getExportRoot(): HTMLElement {
  const el = document.querySelector('.react-flow') as HTMLElement | null
  if (!el) throw new Error('Canvas not found.')
  return el
}

function exportFilter(node: HTMLElement): boolean {
  const skip = [
    'react-flow__controls',
    'react-flow__minimap',
    'react-flow__panel',
    'react-flow__attribution',
    'react-flow__background',
  ]
  // Also skip background pattern nodes (SVG dots / patterns)
  if (node.classList?.contains('react-flow__background-pattern')) return false
  if (node.getAttribute?.('data-testid') === 'rf__background') return false
  return !skip.some((cls) => node.classList?.contains(cls))
}

function canvasBackground(): string {
  return (
    getComputedStyle(document.documentElement).getPropertyValue('--cs-canvas').trim() ||
    '#12151e'
  )
}

function exportOptions() {
  return {
    backgroundColor: canvasBackground(),
    cacheBust: true,
    pixelRatio: 2,
    filter: (node: HTMLElement) => {
      if (!(node instanceof HTMLElement)) return true
      return exportFilter(node)
    },
  }
}

export async function exportPng(filename = 'code-sketch.png') {
  const dataUrl = await toPng(getExportRoot(), exportOptions())
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}

export async function exportSvg(filename = 'code-sketch.svg') {
  const dataUrl = await toSvg(getExportRoot(), exportOptions())
  const svg = decodeURIComponent(dataUrl.split(',')[1] ?? '')
  downloadText(filename, svg, 'image/svg+xml')
}

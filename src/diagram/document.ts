import type { SketchDocument, SketchEdge, SketchNode } from '@/diagram/types'

export const DOCUMENT_VERSION = 1 as const
export const STORAGE_KEY = 'code-sketch-draft'

export function createEmptyDocument(name = 'Untitled'): SketchDocument {
  return {
    version: DOCUMENT_VERSION,
    name,
    diagramType: 'flowchart',
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}

export function serializeDocument(doc: SketchDocument): string {
  return JSON.stringify(doc, null, 2)
}

export function parseDocument(raw: string): SketchDocument {
  const data = JSON.parse(raw) as Partial<SketchDocument>
  if (data.version !== DOCUMENT_VERSION || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw new Error('Unsupported or invalid Code Sketch file.')
  }
  return {
    version: DOCUMENT_VERSION,
    name: data.name ?? 'Untitled',
    diagramType: data.diagramType ?? 'flowchart',
    nodes: data.nodes as SketchNode[],
    edges: data.edges as SketchEdge[],
    viewport: data.viewport ?? { x: 0, y: 0, zoom: 1 },
  }
}

export function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function saveDraft(doc: SketchDocument) {
  localStorage.setItem(STORAGE_KEY, serializeDocument(doc))
}

export function loadDraft(): SketchDocument | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return parseDocument(raw)
  } catch {
    return null
  }
}

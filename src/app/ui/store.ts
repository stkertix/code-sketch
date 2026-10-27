import { create } from 'zustand'

const GRID_KEY = 'code-sketch-show-dot-grid'
const EDGE_ARCS_KEY = 'code-sketch-show-edge-arcs'
const RIGHT_WIDTH_KEY = 'code-sketch-right-panel-width'
const DIAGRAMS_HEIGHT_KEY = 'code-sketch-diagrams-panel-height'

const DEFAULT_RIGHT_WIDTH = 256
const DEFAULT_DIAGRAMS_HEIGHT = 200

type UiState = {
  showDotGrid: boolean
  /** Crossing hop arcs on orthogonal edges. */
  showEdgeArcs: boolean
  rightPanelWidth: number
  diagramsPanelHeight: number
  hydrated: boolean
  hydrate: () => void
  setShowDotGrid: (show: boolean) => void
  toggleDotGrid: () => void
  setShowEdgeArcs: (show: boolean) => void
  toggleEdgeArcs: () => void
  setRightPanelWidth: (width: number) => void
  setDiagramsPanelHeight: (height: number) => void
}

function readNumber(key: string, fallback: number): number {
  const raw = localStorage.getItem(key)
  if (raw == null) return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

function readBool(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key)
  if (raw === null) return fallback
  return raw === 'true'
}

export const useUiStore = create<UiState>((set, get) => ({
  showDotGrid: true,
  showEdgeArcs: true,
  rightPanelWidth: DEFAULT_RIGHT_WIDTH,
  diagramsPanelHeight: DEFAULT_DIAGRAMS_HEIGHT,
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return
    set({
      showDotGrid: readBool(GRID_KEY, true),
      showEdgeArcs: readBool(EDGE_ARCS_KEY, true),
      rightPanelWidth: readNumber(RIGHT_WIDTH_KEY, DEFAULT_RIGHT_WIDTH),
      diagramsPanelHeight: readNumber(DIAGRAMS_HEIGHT_KEY, DEFAULT_DIAGRAMS_HEIGHT),
      hydrated: true,
    })
  },

  setShowDotGrid: (showDotGrid) => {
    localStorage.setItem(GRID_KEY, String(showDotGrid))
    set({ showDotGrid })
  },

  toggleDotGrid: () => {
    get().setShowDotGrid(!get().showDotGrid)
  },

  setShowEdgeArcs: (showEdgeArcs) => {
    localStorage.setItem(EDGE_ARCS_KEY, String(showEdgeArcs))
    set({ showEdgeArcs })
  },

  toggleEdgeArcs: () => {
    get().setShowEdgeArcs(!get().showEdgeArcs)
  },

  setRightPanelWidth: (rightPanelWidth) => {
    localStorage.setItem(RIGHT_WIDTH_KEY, String(rightPanelWidth))
    set({ rightPanelWidth })
  },

  setDiagramsPanelHeight: (diagramsPanelHeight) => {
    localStorage.setItem(DIAGRAMS_HEIGHT_KEY, String(diagramsPanelHeight))
    set({ diagramsPanelHeight })
  },
}))

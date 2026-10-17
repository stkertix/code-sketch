import { create } from 'zustand'

const GRID_KEY = 'code-sketch-show-dot-grid'

type UiState = {
  showDotGrid: boolean
  hydrated: boolean
  hydrate: () => void
  setShowDotGrid: (show: boolean) => void
  toggleDotGrid: () => void
}

export const useUiStore = create<UiState>((set, get) => ({
  showDotGrid: true,
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return
    const raw = localStorage.getItem(GRID_KEY)
    const showDotGrid = raw === null ? true : raw === 'true'
    set({ showDotGrid, hydrated: true })
  },

  setShowDotGrid: (showDotGrid) => {
    localStorage.setItem(GRID_KEY, String(showDotGrid))
    set({ showDotGrid })
  },

  toggleDotGrid: () => {
    get().setShowDotGrid(!get().showDotGrid)
  },
}))

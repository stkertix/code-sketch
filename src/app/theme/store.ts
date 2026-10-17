import { create } from 'zustand'

export type ThemeMode = 'dark' | 'light'

const STORAGE_KEY = 'code-sketch-theme'

type ThemeState = {
  theme: ThemeMode
  hydrated: boolean
  hydrate: () => void
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

function readStoredTheme(): ThemeMode {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === 'light' || raw === 'dark') return raw
  if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light'
  return 'dark'
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'dark',
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return
    const theme = readStoredTheme()
    applyTheme(theme)
    set({ theme, hydrated: true })
  },

  setTheme: (theme) => {
    applyTheme(theme)
    localStorage.setItem(STORAGE_KEY, theme)
    set({ theme })
  },

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    get().setTheme(next)
  },
}))

import { useEffect } from 'react'
import { DiagramCanvas } from '@/canvas/DiagramCanvas'
import { Inspector } from '@/panels/inspector/Inspector'
import { Palette } from '@/panels/palette/Palette'
import { Toolbar } from '@/app/shell/Toolbar'
import { useKeyboardShortcuts } from '@/canvas/useKeyboardShortcuts'
import { useDiagramStore } from '@/diagram/store'
import { useThemeStore } from '@/app/theme/store'
import { useUiStore } from '@/app/ui/store'

export default function App() {
  const hydrate = useDiagramStore((s) => s.hydrate)
  const hydrateTheme = useThemeStore((s) => s.hydrate)
  const hydrateUi = useUiStore((s) => s.hydrate)
  useKeyboardShortcuts()

  useEffect(() => {
    hydrateTheme()
    hydrateUi()
    hydrate()
  }, [hydrate, hydrateTheme, hydrateUi])

  return (
    <div className="flex h-full flex-col bg-[var(--cs-bg)] text-[var(--cs-text)]">
      <Toolbar />
      <div className="flex min-h-0 flex-1">
        <Palette />
        <main className="relative min-w-0 flex-1">
          <DiagramCanvas />
        </main>
        <Inspector />
      </div>
    </div>
  )
}

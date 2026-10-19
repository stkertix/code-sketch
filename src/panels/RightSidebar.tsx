import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { DiagramsPanel } from '@/panels/diagrams/DiagramsPanel'
import { Inspector } from '@/panels/inspector/Inspector'
import { useUiStore } from '@/app/ui/store'

const MIN_WIDTH = 220
const MAX_WIDTH = 520
const MIN_DIAGRAMS_H = 96
const MIN_INSPECTOR_H = 120

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

/** Right column: Inspector + Diagrams, with width and split height drag handles. */
export function RightSidebar() {
  const width = useUiStore((s) => s.rightPanelWidth)
  const diagramsHeight = useUiStore((s) => s.diagramsPanelHeight)
  const setRightPanelWidth = useUiStore((s) => s.setRightPanelWidth)
  const setDiagramsPanelHeight = useUiStore((s) => s.setDiagramsPanelHeight)

  const columnRef = useRef<HTMLElement>(null)
  const widthDrag = useRef<{ startX: number; startW: number } | null>(null)
  const heightDrag = useRef<{ startY: number; startH: number } | null>(null)

  const onWidthPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    widthDrag.current = { startX: e.clientX, startW: useUiStore.getState().rightPanelWidth }
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [])

  const onWidthPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = widthDrag.current
      if (!drag) return
      // Dragging the left edge: move left → wider
      const next = clamp(drag.startW + (drag.startX - e.clientX), MIN_WIDTH, MAX_WIDTH)
      setRightPanelWidth(next)
    },
    [setRightPanelWidth],
  )

  const onWidthPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    widthDrag.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }, [])

  const onHeightPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    heightDrag.current = {
      startY: e.clientY,
      startH: useUiStore.getState().diagramsPanelHeight,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [])

  const onHeightPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = heightDrag.current
      if (!drag) return
      const colH = columnRef.current?.clientHeight ?? 600
      const maxH = Math.max(MIN_DIAGRAMS_H, colH - MIN_INSPECTOR_H)
      // Dragging split up → diagrams taller
      const next = clamp(drag.startH + (drag.startY - e.clientY), MIN_DIAGRAMS_H, maxH)
      setDiagramsPanelHeight(next)
    },
    [setDiagramsPanelHeight],
  )

  const onHeightPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    heightDrag.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }, [])

  // Keep diagrams height within column bounds on window resize
  useEffect(() => {
    const el = columnRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const colH = el.clientHeight
      const maxH = Math.max(MIN_DIAGRAMS_H, colH - MIN_INSPECTOR_H)
      const h = useUiStore.getState().diagramsPanelHeight
      if (h > maxH) setDiagramsPanelHeight(maxH)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [setDiagramsPanelHeight])

  return (
    <aside
      ref={columnRef}
      className="relative flex shrink-0 flex-col border-l border-[var(--cs-border)] bg-[var(--cs-surface)]"
      style={{ width }}
    >
      {/* Width resize — left edge */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize right panel"
        className="absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize touch-none hover:bg-[var(--cs-accent)]/20 active:bg-[var(--cs-accent)]/30"
        onPointerDown={onWidthPointerDown}
        onPointerMove={onWidthPointerMove}
        onPointerUp={onWidthPointerUp}
        onPointerCancel={onWidthPointerUp}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Inspector />
      </div>

      {/* Height resize — between Inspector and Diagrams */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize diagrams panel"
        className="z-10 h-1.5 shrink-0 cursor-row-resize touch-none border-y border-[var(--cs-border)] bg-[var(--cs-surface-2)] hover:bg-[var(--cs-accent)]/25 active:bg-[var(--cs-accent)]/35"
        onPointerDown={onHeightPointerDown}
        onPointerMove={onHeightPointerMove}
        onPointerUp={onHeightPointerUp}
        onPointerCancel={onHeightPointerUp}
      />

      <div className="flex shrink-0 flex-col overflow-hidden" style={{ height: diagramsHeight }}>
        <DiagramsPanel />
      </div>
    </aside>
  )
}

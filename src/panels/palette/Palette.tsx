import { useState } from 'react'
import { Icon } from '@/app/shell/Icon'
import { DIAGRAM_LABELS, PALETTES } from '@/panels/palette/definitions'
import { SHAPE_ICONS } from '@/panels/palette/shapeIcons'
import { useDiagramStore } from '@/diagram/store'
import type { DiagramType, PaletteItem } from '@/diagram/types'

const DIAGRAM_ORDER = Object.keys(DIAGRAM_LABELS) as DiagramType[]

/** Left palette: accordion per diagram type so every shape set is reachable. */
export function Palette() {
  const diagramType = useDiagramStore((s) => s.diagramType)
  const setDiagramType = useDiagramStore((s) => s.setDiagramType)
  const [openTypes, setOpenTypes] = useState<Set<DiagramType>>(
    () => new Set(DIAGRAM_ORDER),
  )

  const toggle = (type: DiagramType) => {
    setOpenTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
    setDiagramType(type)
  }

  return (
    <aside className="flex w-48 shrink-0 flex-col border-r border-[var(--cs-border)] bg-[var(--cs-surface)]">
      <div className="shrink-0 border-b border-[var(--cs-border)] px-2.5 py-2">
        <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--cs-muted)]">
          <Icon name="apps" className="text-[10px]" />
          Diagram type
        </p>
        <p className="mt-0.5 text-[10px] text-[var(--cs-muted)]">Drag shapes onto the canvas</p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {DIAGRAM_ORDER.map((type) => {
          const open = openTypes.has(type)
          const active = diagramType === type
          const items = PALETTES[type]
          return (
            <div
              key={type}
              className={`border-b border-[var(--cs-border)] ${
                active ? 'bg-[var(--cs-accent)]/5' : ''
              }`}
            >
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggle(type)}
                className="flex h-7 w-full items-center gap-1 px-2.5 text-left text-xs font-medium hover:bg-[var(--cs-surface-2)]"
              >
                <Icon
                  name={open ? 'angle-small-down' : 'angle-small-right'}
                  className="shrink-0 text-[10px] text-[var(--cs-muted)]"
                />
                <span className="min-w-0 flex-1 truncate">{DIAGRAM_LABELS[type]}</span>
                <span className="shrink-0 text-[9px] tabular-nums text-[var(--cs-muted)]">
                  {items.length}
                </span>
              </button>
              {open ? (
                <ul className="flex flex-col gap-1 px-2.5 pb-2">
                  {items.map((item) => (
                    <PaletteRow
                      key={`${type}-${item.shape}`}
                      item={item}
                      onDragStart={() => setDiagramType(type)}
                    />
                  ))}
                </ul>
              ) : null}
            </div>
          )
        })}
      </div>
    </aside>
  )
}

function PaletteRow({
  item,
  onDragStart,
}: {
  item: PaletteItem
  onDragStart?: () => void
}) {
  return (
    <li
      draggable
      onDragStart={(e) => {
        onDragStart?.()
        e.dataTransfer.setData('application/code-sketch-shape', item.shape)
        e.dataTransfer.setData('application/code-sketch-color', item.defaultColor)
        e.dataTransfer.setData('application/code-sketch-label', item.label)
        e.dataTransfer.effectAllowed = 'copy'
      }}
      className="flex h-7 cursor-grab items-center gap-1.5 rounded border border-[var(--cs-border)] bg-[var(--cs-surface-2)] px-1.5 text-xs active:cursor-grabbing"
    >
      <span
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded"
        style={{ background: `${item.defaultColor}33`, color: item.defaultColor }}
        aria-hidden
      >
        <Icon name={SHAPE_ICONS[item.shape]} className="text-[11px]" />
      </span>
      {item.label}
    </li>
  )
}

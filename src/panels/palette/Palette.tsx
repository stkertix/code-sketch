import { Icon } from '@/app/shell/Icon'
import { DIAGRAM_LABELS, PALETTES } from '@/panels/palette/definitions'
import { SHAPE_ICONS } from '@/panels/palette/shapeIcons'
import { useDiagramStore } from '@/diagram/store'
import type { DiagramType, PaletteItem } from '@/diagram/types'

export function Palette() {
  const diagramType = useDiagramStore((s) => s.diagramType)
  const setDiagramType = useDiagramStore((s) => s.setDiagramType)
  const items = PALETTES[diagramType]

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-[var(--cs-border)] bg-[var(--cs-surface)]">
      <div className="border-b border-[var(--cs-border)] px-3 py-3">
        <label className="mb-1 block text-[11px] uppercase tracking-wider text-[var(--cs-muted)]">
          Diagram type
        </label>
        <select
          value={diagramType}
          onChange={(e) => setDiagramType(e.target.value as DiagramType)}
          className="h-9 w-full rounded border border-[var(--cs-border)] bg-[var(--cs-surface-2)] px-2 text-sm outline-none focus:border-[var(--cs-accent)]"
        >
          {(Object.keys(DIAGRAM_LABELS) as DiagramType[]).map((key) => (
            <option key={key} value={key}>
              {DIAGRAM_LABELS[key]}
            </option>
          ))}
        </select>
      </div>

      <div className="px-3 py-3">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[var(--cs-muted)]">
          <Icon name="apps" className="text-xs" />
          Shapes
        </p>
        <p className="mb-3 text-xs text-[var(--cs-muted)]">Drag onto the canvas</p>
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <PaletteRow key={item.shape} item={item} />
          ))}
        </ul>
      </div>
    </aside>
  )
}

function PaletteRow({ item }: { item: PaletteItem }) {
  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/code-sketch-shape', item.shape)
        e.dataTransfer.setData('application/code-sketch-color', item.defaultColor)
        e.dataTransfer.setData('application/code-sketch-label', item.label)
        e.dataTransfer.effectAllowed = 'copy'
      }}
      className="flex cursor-grab items-center gap-2 rounded border border-[var(--cs-border)] bg-[var(--cs-surface-2)] px-2 py-2 text-sm active:cursor-grabbing"
    >
      <span
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded"
        style={{ background: `${item.defaultColor}33`, color: item.defaultColor }}
        aria-hidden
      >
        <Icon name={SHAPE_ICONS[item.shape]} className="text-sm" />
      </span>
      {item.label}
    </li>
  )
}

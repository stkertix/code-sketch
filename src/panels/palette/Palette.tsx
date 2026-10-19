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
    <aside className="flex w-48 shrink-0 flex-col border-r border-[var(--cs-border)] bg-[var(--cs-surface)]">
      <div className="border-b border-[var(--cs-border)] px-2.5 py-2">
        <label className="mb-0.5 block text-[10px] uppercase tracking-wider text-[var(--cs-muted)]">
          Diagram type
        </label>
        <select
          value={diagramType}
          onChange={(e) => setDiagramType(e.target.value as DiagramType)}
          className="h-7 w-full rounded border border-[var(--cs-border)] bg-[var(--cs-surface-2)] px-1.5 text-xs outline-none focus:border-[var(--cs-accent)]"
        >
          {(Object.keys(DIAGRAM_LABELS) as DiagramType[]).map((key) => (
            <option key={key} value={key}>
              {DIAGRAM_LABELS[key]}
            </option>
          ))}
        </select>
      </div>

      <div className="px-2.5 py-2">
        <p className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--cs-muted)]">
          <Icon name="apps" className="text-[10px]" />
          Shapes
        </p>
        <p className="mb-2 text-[10px] text-[var(--cs-muted)]">Drag onto the canvas</p>
        <ul className="flex flex-col gap-1">
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

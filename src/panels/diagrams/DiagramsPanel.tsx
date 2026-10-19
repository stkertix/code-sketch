import { useEffect, useRef } from 'react'
import { Icon } from '@/app/shell/Icon'
import {
  listDiagramTree,
  type DiagramGroupRow,
  type DiagramItemRow,
  type DiagramTreeRow,
} from '@/diagram/layers'
import { useDiagramStore } from '@/diagram/store'
import { SHAPE_ICONS } from '@/panels/palette/shapeIcons'
import type { ShapeKind } from '@/diagram/types'

/** Lists canvas items nested under their groups; tick to show/hide on the preview. */
export function DiagramsPanel() {
  const nodes = useDiagramStore((s) => s.nodes)
  const selectedNodeId = useDiagramStore((s) => s.selectedNodeId)
  const setItemVisible = useDiagramStore((s) => s.setItemVisible)
  const setGroupVisible = useDiagramStore((s) => s.setGroupVisible)
  const setSelection = useDiagramStore((s) => s.setSelection)
  const tree = listDiagramTree(nodes)

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-[var(--cs-border)] px-2.5 py-1.5">
        <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--cs-muted)]">
          <Icon name="list" className="text-[10px]" />
          Diagrams
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-1.5 py-1.5">
        {tree.length === 0 ? (
          <p className="px-1 text-[10px] text-[var(--cs-muted)]">
            No items yet. Add shapes from the palette or import Mermaid.
          </p>
        ) : (
          <ul className="flex flex-col">
            {tree.map((row) => (
              <TreeRow
                key={row.id}
                row={row}
                depth={0}
                selectedNodeId={selectedNodeId}
                onSelect={(id) => setSelection(id, null)}
                onToggleItem={setItemVisible}
                onToggleGroup={setGroupVisible}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function TreeRow({
  row,
  depth,
  selectedNodeId,
  onSelect,
  onToggleItem,
  onToggleGroup,
}: {
  row: DiagramTreeRow
  depth: number
  selectedNodeId: string | null
  onSelect: (id: string) => void
  onToggleItem: (id: string, visible: boolean) => void
  onToggleGroup: (id: string, visible: boolean) => void
}) {
  if (row.kind === 'group') {
    return (
      <GroupBlock
        row={row}
        depth={depth}
        selectedNodeId={selectedNodeId}
        onSelect={onSelect}
        onToggleItem={onToggleItem}
        onToggleGroup={onToggleGroup}
      />
    )
  }
  return (
    <ItemRow
      row={row}
      depth={depth}
      selected={row.id === selectedNodeId}
      onSelect={onSelect}
      onToggle={onToggleItem}
    />
  )
}

function GroupBlock({
  row,
  depth,
  selectedNodeId,
  onSelect,
  onToggleItem,
  onToggleGroup,
}: {
  row: DiagramGroupRow
  depth: number
  selectedNodeId: string | null
  onSelect: (id: string) => void
  onToggleItem: (id: string, visible: boolean) => void
  onToggleGroup: (id: string, visible: boolean) => void
}) {
  const checkRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (checkRef.current) checkRef.current.indeterminate = row.indeterminate
  }, [row.indeterminate])

  const selected = row.id === selectedNodeId
  const pad = 4 + depth * 10

  return (
    <li>
      <div
        className={`flex h-6 items-center gap-1 rounded text-xs ${
          selected ? 'bg-[var(--cs-accent)]/15' : 'hover:bg-[var(--cs-surface-2)]'
        }`}
        style={{ paddingLeft: pad }}
      >
        <input
          ref={checkRef}
          type="checkbox"
          checked={row.visible}
          title={row.visible ? 'Hide group' : 'Show group'}
          onChange={(e) => onToggleGroup(row.id, e.target.checked)}
          onClick={(e) => e.stopPropagation()}
          className="h-3 w-3 shrink-0 accent-[var(--cs-accent)]"
        />
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1 text-left font-medium"
          onClick={() => onSelect(row.id)}
          title={row.label}
        >
          <Icon name="object-group" className="shrink-0 text-[10px] text-[var(--cs-muted)]" />
          <span className="min-w-0 flex-1 truncate">{row.label}</span>
        </button>
      </div>
      {row.children.length > 0 ? (
        <ul className="flex flex-col">
          {row.children.map((child) => (
            <TreeRow
              key={child.id}
              row={child}
              depth={depth + 1}
              selectedNodeId={selectedNodeId}
              onSelect={onSelect}
              onToggleItem={onToggleItem}
              onToggleGroup={onToggleGroup}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

function ItemRow({
  row,
  depth,
  selected,
  onSelect,
  onToggle,
}: {
  row: DiagramItemRow
  depth: number
  selected: boolean
  onSelect: (id: string) => void
  onToggle: (id: string, visible: boolean) => void
}) {
  const icon = SHAPE_ICONS[row.shape as ShapeKind] ?? 'box'
  const pad = 4 + depth * 10

  return (
    <li>
      <div
        className={`flex h-6 items-center gap-1 rounded text-xs ${
          selected ? 'bg-[var(--cs-accent)]/15' : 'hover:bg-[var(--cs-surface-2)]'
        }`}
        style={{ paddingLeft: pad }}
      >
        <input
          type="checkbox"
          checked={row.visible}
          title={row.visible ? 'Hide on canvas' : 'Show on canvas'}
          onChange={(e) => onToggle(row.id, e.target.checked)}
          onClick={(e) => e.stopPropagation()}
          className="h-3 w-3 shrink-0 accent-[var(--cs-accent)]"
        />
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1 text-left"
          onClick={() => onSelect(row.id)}
          title={row.label}
        >
          <Icon name={icon} className="shrink-0 text-[10px] text-[var(--cs-muted)]" />
          <span className="min-w-0 flex-1 truncate">{row.label}</span>
        </button>
      </div>
    </li>
  )
}

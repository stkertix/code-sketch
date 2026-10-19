import { isGroupNode } from '@/diagram/grouping'
import type { SketchNode } from '@/diagram/types'

export type DiagramItemRow = {
  kind: 'item'
  id: string
  label: string
  shape: string
  visible: boolean
}

export type DiagramGroupRow = {
  kind: 'group'
  id: string
  label: string
  /** true when every item under this group is visible */
  visible: boolean
  /** true when some but not all items are visible */
  indeterminate: boolean
  children: DiagramTreeRow[]
}

export type DiagramTreeRow = DiagramGroupRow | DiagramItemRow

function toItem(n: SketchNode): DiagramItemRow {
  return {
    kind: 'item',
    id: n.id,
    label: n.data.label?.trim() || n.id,
    shape: n.data.shape,
    visible: !n.hidden,
  }
}

function sortRows(a: DiagramTreeRow, b: DiagramTreeRow): number {
  if (a.kind !== b.kind) return a.kind === 'group' ? -1 : 1
  return a.label.localeCompare(b.label) || a.id.localeCompare(b.id)
}

function buildChildren(
  parentId: string | undefined,
  byParent: Map<string | undefined, SketchNode[]>,
): DiagramTreeRow[] {
  const kids = byParent.get(parentId) ?? []
  const rows: DiagramTreeRow[] = []

  for (const n of kids) {
    if (isGroupNode(n)) {
      const children = buildChildren(n.id, byParent)
      const items = flattenItems(children)
      const visibleCount = items.filter((i) => i.visible).length
      const allVisible = items.length === 0 ? !n.hidden : visibleCount === items.length
      const noneVisible = items.length === 0 ? !!n.hidden : visibleCount === 0
      rows.push({
        kind: 'group',
        id: n.id,
        label: n.data.label?.trim() || 'Group',
        visible: allVisible,
        indeterminate: !allVisible && !noneVisible,
        children,
      })
    } else {
      rows.push(toItem(n))
    }
  }

  return rows.sort(sortRows)
}

function flattenItems(rows: DiagramTreeRow[]): DiagramItemRow[] {
  const out: DiagramItemRow[] = []
  for (const row of rows) {
    if (row.kind === 'item') out.push(row)
    else out.push(...flattenItems(row.children))
  }
  return out
}

/** Tree of groups → items for the Diagrams panel (nested groups supported). */
export function listDiagramTree(nodes: SketchNode[]): DiagramTreeRow[] {
  const byParent = new Map<string | undefined, SketchNode[]>()
  for (const n of nodes) {
    const key = n.parentId
    const list = byParent.get(key) ?? []
    list.push(n)
    byParent.set(key, list)
  }
  return buildChildren(undefined, byParent)
}

/** All node ids under a group (the group itself + nested groups + items). */
export function collectGroupMemberIds(groupId: string, nodes: SketchNode[]): Set<string> {
  const byParent = new Map<string, string[]>()
  for (const n of nodes) {
    if (!n.parentId) continue
    const list = byParent.get(n.parentId) ?? []
    list.push(n.id)
    byParent.set(n.parentId, list)
  }
  const out = new Set<string>()
  const stack = [groupId]
  while (stack.length) {
    const id = stack.pop()!
    if (out.has(id)) continue
    out.add(id)
    for (const child of byParent.get(id) ?? []) stack.push(child)
  }
  return out
}

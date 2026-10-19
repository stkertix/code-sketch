import { parseAttributeLines } from '@/diagram/entityAttributes'
import type { EdgeLineStyle, EdgeMarkerKind } from '@/diagram/edges'
import type { DiagramType, SketchEdge, SketchNode } from '@/diagram/types'

function escapeLabel(text: string): string {
  return text.replace(/"/g, '#quot;').replace(/\[/g, '#').replace(/\]/g, '#').trim()
}

function escapeMermaidIdPart(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .replace(/^-+/, '')
}

/** Stable Mermaid-safe id; disambiguates collisions. */
function buildIdMap(nodes: SketchNode[]): Map<string, string> {
  const used = new Set<string>()
  const map = new Map<string, string>()

  for (const node of nodes) {
    if (node.data.shape === 'group') continue
    const fromLabel = escapeMermaidIdPart(node.data.label || '')
    const fromId = escapeMermaidIdPart(node.id.replace(/^n[_-]?/, 'n'))
    let base =
      fromLabel && /^[A-Za-z_]/.test(fromLabel)
        ? fromLabel
        : fromId && /^[A-Za-z_]/.test(fromId)
          ? fromId
          : `n_${map.size + 1}`

    let candidate = base
    let n = 2
    while (used.has(candidate)) {
      candidate = `${base}_${n}`
      n += 1
    }
    used.add(candidate)
    map.set(node.id, candidate)
  }
  return map
}

function erCardToken(marker: EdgeMarkerKind | undefined, side: 'left' | 'right'): string {
  switch (marker) {
    case 'one':
      return '||'
    case 'zeroOrOne':
      return side === 'left' ? 'o|' : '|o'
    case 'many':
    case 'oneOrMany':
      return side === 'left' ? '}|' : '|{'
    case 'zeroOrMany':
      return side === 'left' ? '}o' : 'o{'
    case 'zero':
      return side === 'left' ? 'o|' : '|o'
    case 'arrow':
    case 'arrowOpen':
    case 'dot':
    case 'circle':
    case 'none':
    default:
      return '||'
  }
}

/** Bare id when valid; otherwise quoted label for Mermaid ER. */
function erEntityRef(id: string, label: string): string {
  if (/^[A-Za-z_][\w-]*$/.test(id)) return id
  const safe = label.replace(/"/g, '').trim() || id
  return `"${safe}"`
}

function toMermaidErAttributes(lines: string[] | undefined): string[] {
  if (!lines?.length) return []
  return parseAttributeLines(lines).map((attr) => {
    const keys = attr.keys ? ` ${attr.keys.replace(/,/g, ', ')}` : ''
    const type = attr.datatype || 'string'
    return `        ${type} ${attr.name}${keys}`
  })
}

function exportErd(nodes: SketchNode[], edges: SketchEdge[]): string {
  const idMap = buildIdMap(nodes)
  const entities = nodes.filter((n) => n.data.shape === 'entity' || idMap.has(n.id))
  const lines: string[] = ['erDiagram']

  for (const edge of edges) {
    const src = nodes.find((n) => n.id === edge.source)
    const tgt = nodes.find((n) => n.id === edge.target)
    if (!src || !tgt) continue
    const srcId = idMap.get(src.id)
    const tgtId = idMap.get(tgt.id)
    if (!srcId || !tgtId) continue

    const left = erCardToken(edge.data?.sourceMarker as EdgeMarkerKind | undefined, 'left')
    const right = erCardToken(edge.data?.targetMarker as EdgeMarkerKind | undefined, 'right')
    const connector = edge.data?.lineStyle === 'dashed' ? '..' : '--'
    const srcRef = erEntityRef(srcId, src.data.label)
    const tgtRef = erEntityRef(tgtId, tgt.data.label)
    // Mermaid ER requires `: label` after every relationship (empty → "")
    const rawLabel =
      typeof edge.label === 'string' ? edge.label.trim().replace(/"/g, '') : ''
    const labelPart =
      !rawLabel
        ? ' : ""'
        : /\s/.test(rawLabel) || !/^[\w.-]+$/.test(rawLabel)
          ? ` : "${rawLabel}"`
          : ` : ${rawLabel}`
    lines.push(`    ${srcRef} ${left}${connector}${right} ${tgtRef}${labelPart}`)
  }

  for (const node of entities) {
    const mid = idMap.get(node.id)
    if (!mid) continue
    if (node.data.shape === 'group') continue
    const attrs = toMermaidErAttributes(node.data.attributes)
    const ref = erEntityRef(mid, node.data.label)
    if (attrs.length === 0) continue
    lines.push(`    ${ref} {`)
    lines.push(...attrs)
    lines.push('    }')
  }

  // Entities with no attributes and no relations still need a declaration
  for (const node of entities) {
    const mid = idMap.get(node.id)
    if (!mid || node.data.shape === 'group') continue
    const attrs = toMermaidErAttributes(node.data.attributes)
    if (attrs.length > 0) continue
    const mentioned = lines.some((l) => l.includes(mid) || l.includes(`"${node.data.label}"`))
    if (!mentioned) {
      lines.push(`    ${erEntityRef(mid, node.data.label)} {`)
      lines.push('        string id PK')
      lines.push('    }')
    }
  }

  return `${lines.join('\n')}\n`
}

function flowNodeDecl(id: string, label: string, shape: string): string {
  const text = escapeLabel(label || id)
  switch (shape) {
    case 'decision':
      return `${id}{${text}}`
    case 'startEnd':
      return `${id}([${text}])`
    case 'connector':
      return `${id}((${text}))`
    case 'database':
      return `${id}[(${text})]`
    case 'cloud':
    case 'box':
    case 'service':
    case 'process':
    default:
      return `${id}[${text}]`
  }
}

function flowEdgeArrow(lineStyle: EdgeLineStyle | undefined): string {
  if (lineStyle === 'dashed' || lineStyle === 'dotted') return '-.->'
  return '-->'
}

function exportFlowchartLike(
  nodes: SketchNode[],
  edges: SketchEdge[],
  direction: 'TD' | 'LR',
  header = 'flowchart',
): string {
  const idMap = buildIdMap(nodes)
  const groups = nodes.filter((n) => n.data.shape === 'group')
  const shapes = nodes.filter((n) => n.data.shape !== 'group' && idMap.has(n.id))
  const childrenOf = new Map<string, SketchNode[]>()
  const roots: SketchNode[] = []

  for (const n of shapes) {
    if (n.parentId && groups.some((g) => g.id === n.parentId)) {
      const list = childrenOf.get(n.parentId!) ?? []
      list.push(n)
      childrenOf.set(n.parentId!, list)
    } else {
      roots.push(n)
    }
  }

  const lines: string[] = [`${header} ${direction}`]
  const emitted = new Set<string>()

  const emitNode = (node: SketchNode, indent = '  ') => {
    const mid = idMap.get(node.id)
    if (!mid || emitted.has(node.id)) return
    emitted.add(node.id)
    lines.push(`${indent}${flowNodeDecl(mid, node.data.label, node.data.shape)}`)
  }

  for (const g of groups) {
    const kids = childrenOf.get(g.id) ?? []
    if (kids.length === 0) continue
    const gid = escapeMermaidIdPart(g.data.label || g.id) || `group_${emitted.size}`
    lines.push(`  subgraph ${gid} ["${escapeLabel(g.data.label || 'Group')}"]`)
    for (const child of kids) emitNode(child, '    ')
    lines.push('  end')
  }

  for (const n of roots) emitNode(n)

  for (const edge of edges) {
    const s = idMap.get(edge.source)
    const t = idMap.get(edge.target)
    if (!s || !t) continue
    const arrow = flowEdgeArrow(edge.data?.lineStyle as EdgeLineStyle | undefined)
    const label = typeof edge.label === 'string' && edge.label.trim() ? edge.label.trim() : ''
    if (label) lines.push(`  ${s} ${arrow}|${escapeLabel(label)}| ${t}`)
    else lines.push(`  ${s} ${arrow} ${t}`)
  }

  return `${lines.join('\n')}\n`
}

function exportUml(nodes: SketchNode[], edges: SketchEdge[]): string {
  const idMap = buildIdMap(nodes)
  const lines: string[] = ['classDiagram']

  for (const node of nodes) {
    const mid = idMap.get(node.id)
    if (!mid) continue
    if (node.data.shape !== 'class' && node.data.shape !== 'interface') continue

    lines.push(`  class ${mid} {`)
    if (node.data.shape === 'interface') {
      lines.push('    <<interface>>')
    }
    for (const attr of node.data.attributes ?? []) {
      const a = attr.trim()
      if (a) lines.push(`    ${a}`)
    }
    for (const method of node.data.methods ?? []) {
      const m = method.trim()
      if (m) lines.push(`    ${m}`)
    }
    lines.push('  }')
    if (node.data.label && node.data.label !== mid) {
      lines.push(`  ${mid} : ${node.data.label}`)
    }
  }

  for (const edge of edges) {
    const s = idMap.get(edge.source)
    const t = idMap.get(edge.target)
    if (!s || !t) continue
    const label = typeof edge.label === 'string' && edge.label.trim() ? edge.label.trim() : ''
    const dashed = edge.data?.lineStyle === 'dashed' || edge.data?.lineStyle === 'dotted'
    const link = dashed ? '..>' : '-->'
    if (label) lines.push(`  ${s} ${link} ${t} : ${label}`)
    else lines.push(`  ${s} ${link} ${t}`)
  }

  return `${lines.join('\n')}\n`
}

/**
 * Convert the current canvas graph to Mermaid source for the active diagram type.
 */
export function flowToMermaid(
  nodes: SketchNode[],
  edges: SketchEdge[],
  diagramType: DiagramType,
): string {
  const shapes = nodes.filter((n) => n.data.shape !== 'group')
  if (shapes.length === 0) {
    throw new Error('Nothing to export — add shapes to the canvas first.')
  }

  switch (diagramType) {
    case 'erd':
      return exportErd(nodes, edges)
    case 'uml':
      return exportUml(nodes, edges)
    case 'architecture':
      return exportFlowchartLike(nodes, edges, 'LR', 'flowchart')
    case 'general':
    case 'flowchart':
      return exportFlowchartLike(nodes, edges, 'TD', 'flowchart')
  }
}

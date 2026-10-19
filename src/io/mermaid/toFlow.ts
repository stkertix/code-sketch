import mermaid from 'mermaid'
import type { EdgeLineStyle, EdgeMarkerKind } from '@/diagram/edges'
import { pickHandleSides, toDedicatedHandle } from '@/diagram/handles'
import { autoLayoutGraph } from '@/diagram/autoLayout'
import {
  DEFAULT_ENTITY_ATTRIBUTES,
  normalizeAttributeLine,
} from '@/diagram/entityAttributes'
import {
  DEFAULT_ENTITY_LAYOUT_HEIGHT,
  DEFAULT_ENTITY_SIZE,
  DEFAULT_GROUP_SIZE,
  GRID_SIZE,
  snapToGrid,
} from '@/diagram/grid'
import { orderNodesParentsFirst } from '@/diagram/grouping'
import { createId } from '@/diagram/ids'
import type { DiagramType, SketchEdge, SketchNode, SketchNodeData } from '@/diagram/types'

/** Attach source/target handles from node geometry so routes stay short. */
function withGeometricHandles(nodes: SketchNode[], edges: SketchEdge[]): SketchEdge[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return edges.map((e) => {
    const s = byId.get(e.source)
    const t = byId.get(e.target)
    if (!s || !t) return e
    const sw = s.width ?? 160
    const sh = s.height ?? 80
    const tw = t.width ?? 160
    const th = t.height ?? 80
    const sides = pickHandleSides(
      { x: s.position.x, y: s.position.y, width: sw, height: sh },
      { x: t.position.x, y: t.position.y, width: tw, height: th },
    )
    return {
      ...e,
      sourceHandle: toDedicatedHandle(sides.source, e.id, sides.source),
      targetHandle: toDedicatedHandle(sides.target, e.id, sides.target),
    }
  })
}

function makeEdge(
  source: string,
  target: string,
  label?: string,
  markers?: {
    sourceMarker?: EdgeMarkerKind
    targetMarker?: EdgeMarkerKind
    lineStyle?: EdgeLineStyle
  },
): SketchEdge {
  return {
    id: createId('e'),
    source,
    target,
    label,
    type: 'smoothstep',
    style: { stroke: 'var(--cs-edge)', strokeWidth: 2 },
    data: {
      sourceMarker: markers?.sourceMarker ?? 'none',
      targetMarker: markers?.targetMarker ?? 'arrow',
      lineStyle: markers?.lineStyle ?? 'solid',
    },
  }
}

/** Mermaid entity id / alias: WORD, WORD-WITH-DASH, or "Quoted Name". */
const ER_ENTITY = String.raw`(?:"([^"]+)"|([A-Za-z_][\w-]*))`

function erEntityName(quoted: string | undefined, bare: string | undefined): string {
  return (quoted ?? bare ?? '').trim()
}

export type MermaidImportResult = {
  nodes: SketchNode[]
  edges: SketchEdge[]
  diagramType: DiagramType
}

mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' })

function stripComments(source: string): string {
  return source
    .replace(/%%.*/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
}

function detectType(source: string): DiagramType | 'unsupported' {
  const head = source.trim().toLowerCase()
  if (head.startsWith('erdiagram')) return 'erd'
  if (head.startsWith('classdiagram')) return 'uml'
  if (
    head.startsWith('flowchart') ||
    head.startsWith('graph ') ||
    head.startsWith('graph\n') ||
    /^graph\s/.test(head)
  ) {
    return 'flowchart'
  }
  if (head.startsWith('c4') || head.includes('architecture-beta') || head.startsWith('architecture')) {
    return 'architecture'
  }
  return 'unsupported'
}

function layoutGrid(count: number, cols = 4): Array<{ x: number; y: number }> {
  const colW = snapToGrid(DEFAULT_ENTITY_SIZE.width + GRID_SIZE * 2)
  const rowH = snapToGrid(DEFAULT_ENTITY_LAYOUT_HEIGHT + GRID_SIZE * 3)
  const origin = GRID_SIZE * 2
  return Array.from({ length: count }, (_, i) => ({
    x: (i % cols) * colW + origin,
    y: Math.floor(i / cols) * rowH + origin,
  }))
}

function makeNode(
  id: string,
  position: { x: number; y: number },
  data: SketchNodeData,
  size?: { width: number; height?: number },
): SketchNode {
  const isCard =
    data.shape === 'entity' || data.shape === 'class' || data.shape === 'interface'
  return {
    id,
    type: 'sketch',
    position,
    data,
    ...(size
      ? {
          style: {
            width: size.width,
            // Cards size vertically to attribute/method content
            ...(size.height != null && !isCard ? { height: size.height } : {}),
          },
        }
      : {}),
  }
}

type FlowNodeMeta = { label: string; shape: SketchNodeData['shape'] }

/** Decode common Mermaid label escapes. */
function decodeFlowLabel(raw: string): string {
  return raw
    .replace(/#quot;/gi, '"')
    .replace(/#39;/g, "'")
    .replace(/#lt;/gi, '<')
    .replace(/#gt;/gi, '>')
    .replace(/#amp;/gi, '&')
    .trim()
}

/**
 * Parse an optional Mermaid node shape after an id.
 * Order matters: stadium/cylinder before plain round/rect.
 */
function takeFlowShape(
  input: string,
): { shape: SketchNodeData['shape']; label: string; rest: string } | null {
  const s = input.trimStart()
  // Stadium / pill: ([label])
  let m = s.match(/^\(\[([^\]]*)\]\)/)
  if (m) {
    return { shape: 'startEnd', label: decodeFlowLabel(m[1]), rest: s.slice(m[0].length) }
  }
  // Cylinder / database: [(label)]
  m = s.match(/^\[\(\s*([^\)]*?)\s*\)\]/)
  if (m) {
    return { shape: 'database', label: decodeFlowLabel(m[1]), rest: s.slice(m[0].length) }
  }
  // Circle: ((label))
  m = s.match(/^\(\(([^)]*)\)\)/)
  if (m) {
    return { shape: 'connector', label: decodeFlowLabel(m[1]), rest: s.slice(m[0].length) }
  }
  // Diamond: {label}
  m = s.match(/^\{([^{}]*)\}/)
  if (m) {
    return { shape: 'decision', label: decodeFlowLabel(m[1]), rest: s.slice(m[0].length) }
  }
  // Round: (label)
  m = s.match(/^\(([^)]*)\)/)
  if (m) {
    return { shape: 'startEnd', label: decodeFlowLabel(m[1]), rest: s.slice(m[0].length) }
  }
  // Rect / square: [label] or ["quoted"]
  m = s.match(/^\[\s*"([^"]*)"\s*\]/)
  if (m) {
    return { shape: 'process', label: decodeFlowLabel(m[1]), rest: s.slice(m[0].length) }
  }
  m = s.match(/^\[([^\]]*)\]/)
  if (m) {
    return { shape: 'process', label: decodeFlowLabel(m[1]), rest: s.slice(m[0].length) }
  }
  return null
}

function takeFlowId(input: string): { id: string; rest: string } | null {
  const s = input.trimStart()
  const m = s.match(/^([A-Za-z_][\w-]*)/)
  if (!m) return null
  return { id: m[1], rest: s.slice(m[0].length) }
}

const FLOW_ARROW_RE =
  /^(-->|---|-.->|==>|==|~~~|-->>|--x|--+o|<-->|<--|<---)/

function takeFlowArrow(
  input: string,
): { arrow: string; lineStyle: EdgeLineStyle; rest: string } | null {
  const s = input.trimStart()
  const m = s.match(FLOW_ARROW_RE)
  if (!m) return null
  const arrow = m[1]
  const lineStyle: EdgeLineStyle =
    arrow.includes('-.') || arrow.includes('~~') ? 'dashed' : 'solid'
  return { arrow, lineStyle, rest: s.slice(m[0].length) }
}

function takeFlowEdgeLabel(input: string): { label?: string; rest: string } {
  const s = input.trimStart()
  // |label| or |"label"|
  let m = s.match(/^\|\s*"([^"]*)"\s*\|/)
  if (m) return { label: decodeFlowLabel(m[1]), rest: s.slice(m[0].length) }
  m = s.match(/^\|([^|]*)\|/)
  if (m) return { label: decodeFlowLabel(m[1]), rest: s.slice(m[0].length) }
  // text after arrow without pipes: A -- text --> B (less common; skip for MVP)
  return { rest: s }
}

function ensureFlowNode(
  map: Map<string, FlowNodeMeta>,
  id: string,
  label?: string,
  shape: SketchNodeData['shape'] = 'process',
) {
  const existing = map.get(id)
  if (!existing) {
    map.set(id, { label: label?.trim() || id, shape })
    return
  }
  // Prefer richer shape/label when a later mention includes them
  const nextLabel = label?.trim()
  if (nextLabel && (existing.label === id || nextLabel !== existing.label)) {
    existing.label = nextLabel
  }
  if (shape !== 'process' || existing.shape === 'process') {
    if (shape !== 'process') existing.shape = shape
  }
}

function parseFlowEndpoint(
  input: string,
  map: Map<string, FlowNodeMeta>,
): { id: string; rest: string } | null {
  const idPart = takeFlowId(input)
  if (!idPart) return null
  const shaped = takeFlowShape(idPart.rest)
  if (shaped) {
    ensureFlowNode(map, idPart.id, shaped.label, shaped.shape)
    return { id: idPart.id, rest: shaped.rest }
  }
  ensureFlowNode(map, idPart.id)
  return { id: idPart.id, rest: idPart.rest }
}

/**
 * Parse one flowchart statement line into nodes/edges.
 * Supports: `A[Label] -->|yes| B{Ready?}`, `start([Start]) --> done([Done])`, `A --> B`
 * Returns node ids referenced on the line (for subgraph membership).
 */
function parseFlowStatement(
  line: string,
  map: Map<string, FlowNodeMeta>,
  edgeList: Array<{ source: string; target: string; label?: string; lineStyle: EdgeLineStyle }>,
): string[] {
  let rest = line.trim()
  if (!rest || rest === 'end') return []
  if (/^(subgraph|direction|style|classDef|class|linkStyle|click)\b/i.test(rest)) return []

  const touched: string[] = []

  // Standalone node declaration: id[Label]
  const alone = parseFlowEndpoint(rest, map)
  if (alone && alone.rest.trim() === '') {
    touched.push(alone.id)
    return touched
  }

  // Chain: A --> B --> C (consume left-to-right)
  let left = parseFlowEndpoint(rest, map)
  if (!left) return []
  touched.push(left.id)
  rest = left.rest
  let matched = false

  while (true) {
    const arrow = takeFlowArrow(rest)
    if (!arrow) break
    rest = arrow.rest
    const edgeLabel = takeFlowEdgeLabel(rest)
    rest = edgeLabel.rest
    const right = parseFlowEndpoint(rest, map)
    if (!right) break
    touched.push(right.id)
    edgeList.push({
      source: left.id,
      target: right.id,
      label: edgeLabel.label,
      lineStyle: arrow.lineStyle,
    })
    left = right
    rest = right.rest
    matched = true
  }

  return matched || alone !== null ? touched : []
}

type SubgraphMeta = { id: string; label: string; parentId?: string }

/** Sanitize free-text into a Mermaid-safe id fragment. */
function slugFlowId(raw: string): string {
  const slug = raw
    .trim()
    .replace(/[^\w-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return slug || createId('sg')
}

/**
 * Parse `subgraph …` header → group id + label.
 * Supports: bare id, `id [Title]`, `id ["Title"]`, `"Title"`, free-text title.
 */
function parseSubgraphHeader(line: string): { id: string; label: string } | null {
  const m = line.match(/^subgraph\b\s*(.*)$/i)
  if (!m) return null
  const rest = m[1].trim()
  if (!rest) return { id: createId('sg'), label: 'Group' }

  let hm = rest.match(/^([A-Za-z_][\w-]*)\s*\[\s*"([^"]*)"\s*\]$/)
  if (hm) return { id: hm[1], label: decodeFlowLabel(hm[2]) || hm[1] }

  hm = rest.match(/^([A-Za-z_][\w-]*)\s*\[\s*([^\]]*)\s*\]$/)
  if (hm) return { id: hm[1], label: decodeFlowLabel(hm[2]) || hm[1] }

  hm = rest.match(/^"([^"]*)"$/)
  if (hm) {
    const label = decodeFlowLabel(hm[1]) || 'Group'
    return { id: slugFlowId(label), label }
  }

  hm = rest.match(/^([A-Za-z_][\w-]*)$/)
  if (hm) return { id: hm[1], label: hm[1] }

  const label = decodeFlowLabel(rest.replace(/^["']|["']$/g, '')) || 'Group'
  return { id: slugFlowId(label), label }
}

function flowShapeColor(shape: SketchNodeData['shape']): string {
  if (shape === 'decision') return '#e8c37a'
  if (shape === 'startEnd') return '#7dd3a8'
  if (shape === 'database') return '#8b7ec8'
  return '#5b8def'
}

function parseFlowchart(source: string): MermaidImportResult {
  const lines = stripComments(source)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    // Drop the header line (flowchart TD / graph LR / …)
    .filter((l, i) => !(i === 0 && /^(flowchart|graph)\b/i.test(l)))

  const nodeMap = new Map<string, FlowNodeMeta>()
  const edgeList: Array<{
    source: string
    target: string
    label?: string
    lineStyle: EdgeLineStyle
  }> = []
  const groupMap = new Map<string, SubgraphMeta>()
  /** Subgraph membership: last explicit placement inside a subgraph wins. */
  const nodeParent = new Map<string, string>()
  const stack: string[] = []

  for (const line of lines) {
    const sg = parseSubgraphHeader(line)
    if (sg) {
      let id = sg.id
      if (groupMap.has(id)) {
        let n = 2
        while (groupMap.has(`${sg.id}_${n}`)) n += 1
        id = `${sg.id}_${n}`
      }
      const parentId = stack[stack.length - 1]
      groupMap.set(id, { id, label: sg.label, parentId })
      stack.push(id)
      continue
    }

    if (/^end$/i.test(line)) {
      stack.pop()
      continue
    }

    const touched = parseFlowStatement(line, nodeMap, edgeList)
    const currentGroup = stack[stack.length - 1]
    if (!currentGroup) continue
    for (const id of touched) {
      if (groupMap.has(id)) continue
      nodeParent.set(id, currentGroup)
    }
  }

  // Subgraph ids are not shape nodes even if referenced by edges
  for (const gid of groupMap.keys()) nodeMap.delete(gid)

  if (nodeMap.size === 0 && groupMap.size === 0) {
    throw new Error('No flowchart nodes found. Check ids and shape syntax (e.g. A[Label] --> B).')
  }

  const shapeIds = [...nodeMap.keys()]
  const positions = layoutGrid(Math.max(shapeIds.length, 1))
  const shapeNodes: SketchNode[] = shapeIds.map((id, i) => {
    const meta = nodeMap.get(id)!
    const parentId = nodeParent.get(id)
    const validParent = parentId && groupMap.has(parentId) ? parentId : undefined
    return {
      ...makeNode(id, validParent ? { x: GRID_SIZE * 2, y: GRID_SIZE * 2 } : positions[i], {
        label: meta.label,
        shape: meta.shape,
        color: flowShapeColor(meta.shape),
      }),
      parentId: validParent,
      zIndex: 1,
    }
  })

  const groupNodes: SketchNode[] = [...groupMap.values()].map((g) => ({
    ...makeNode(
      g.id,
      { x: 0, y: 0 },
      { label: g.label, shape: 'group', color: '#6b7c93' },
      DEFAULT_GROUP_SIZE,
    ),
    parentId: g.parentId && groupMap.has(g.parentId) ? g.parentId : undefined,
    zIndex: 0,
  }))

  const nodes = orderNodesParentsFirst([...groupNodes, ...shapeNodes])
  const knownIds = new Set(nodes.map((n) => n.id))
  const rawEdges = edgeList
    .filter((e) => knownIds.has(e.source) && knownIds.has(e.target))
    .map((e) => makeEdge(e.source, e.target, e.label, { lineStyle: e.lineStyle }))

  const laid = autoLayoutGraph(nodes, rawEdges, 'flowchart')
  const edges = withGeometricHandles(laid.nodes, laid.edges)

  return { nodes: laid.nodes, edges, diagramType: 'flowchart' }
}

/** Map Mermaid ER cardinality token (one side of the relationship) → crow's foot marker. */
function erCardinalityMarker(token: string): EdgeMarkerKind {
  const t = token.replace(/\s/g, '')
  if (t === '||' || t === '|') return 'one'
  if (t === 'o|' || t === '|o') return 'zeroOrOne'
  if (t === '}o' || t === 'o{' || t === 'o}' || t === '{o') return 'zeroOrMany'
  if (t === '}|' || t === '|{' || t === '{|' || t === '|{') return 'oneOrMany'
  if (t === '{' || t === '}') return 'many'
  if (t === 'o') return 'zero'
  return 'one'
}

type ErdRelation = {
  source: string
  target: string
  label?: string
  sourceMarker: EdgeMarkerKind
  targetMarker: EdgeMarkerKind
  lineStyle: EdgeLineStyle
}

/** Reject names that are really cardinality glyphs (e.g. lone "o" from `||--o{`). */
function isValidErEntityName(name: string): boolean {
  if (!name) return false
  if (/^[|o{}]+$/i.test(name)) return false
  if (/^(subgraph|end|erDiagram|direction)$/i.test(name)) return false
  return true
}

/**
 * Entity names referenced on one ER line (relationship, bare id, or `Name {`).
 * Used for subgraph → group membership.
 */
function extractErEntityNamesFromLine(line: string): string[] {
  const trimmed = line.trim()
  if (!trimmed) return []
  if (/^(subgraph|end|erDiagram|direction)\b/i.test(trimmed)) return []

  const relRe = new RegExp(
    `^${ER_ENTITY}\\s+([|o}{]{1,3})(--|\\.\\.)([|o}{]{1,3})\\s+${ER_ENTITY}`,
  )
  const rel = trimmed.match(relRe)
  if (rel) {
    return [erEntityName(rel[1], rel[2]), erEntityName(rel[6], rel[7])].filter(isValidErEntityName)
  }

  const blockOpen = trimmed.match(new RegExp(`^${ER_ENTITY}\\s*\\{`))
  if (blockOpen) {
    const name = erEntityName(blockOpen[1], blockOpen[2])
    return isValidErEntityName(name) ? [name] : []
  }

  const bare = trimmed.match(new RegExp(`^${ER_ENTITY}$`))
  if (bare) {
    const name = erEntityName(bare[1], bare[2])
    return isValidErEntityName(name) ? [name] : []
  }
  return []
}

/** Collect subgraph tree + entity membership; returns content lines without subgraph/end. */
function collectErdSubgraphs(lines: string[]): {
  groupMap: Map<string, SubgraphMeta>
  entityParent: Map<string, string>
  contentLines: string[]
} {
  const groupMap = new Map<string, SubgraphMeta>()
  const entityParent = new Map<string, string>()
  const contentLines: string[] = []
  const stack: string[] = []

  for (const line of lines) {
    const sg = parseSubgraphHeader(line)
    if (sg) {
      let id = sg.id
      if (groupMap.has(id)) {
        let n = 2
        while (groupMap.has(`${sg.id}_${n}`)) n += 1
        id = `${sg.id}_${n}`
      }
      const parentId = stack[stack.length - 1]
      groupMap.set(id, { id, label: sg.label, parentId })
      stack.push(id)
      continue
    }
    if (/^end$/i.test(line)) {
      stack.pop()
      continue
    }

    contentLines.push(line)
    const current = stack[stack.length - 1]
    if (!current) continue
    for (const name of extractErEntityNamesFromLine(line)) {
      if (groupMap.has(name)) continue
      entityParent.set(name, current)
    }
  }

  return { groupMap, entityParent, contentLines }
}

function parseErd(source: string): MermaidImportResult {
  const text = stripComments(source)
  const allLines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l, i) => !(i === 0 && /^erDiagram\b/i.test(l)))

  const { groupMap, entityParent, contentLines } = collectErdSubgraphs(allLines)
  const body = contentLines.join('\n')
  const entities = new Map<string, string[]>()
  const relations: ErdRelation[] = []

  // Bare entities listed inside subgraphs (no relationships yet)
  for (const name of entityParent.keys()) {
    if (!entities.has(name)) entities.set(name, [...DEFAULT_ENTITY_ATTRIBUTES])
  }

  // Relationships: A ||--o{ B : label  |  A }|..|{ B
  // Supports hyphenated ids (LINE-ITEM) and non-identifying `..`
  const relRe = new RegExp(
    `${ER_ENTITY}\\s+([|o}{]{1,3})(--|\\.\\.)([|o}{]{1,3})\\s+${ER_ENTITY}(?:\\s*:\\s*(?:"([^"]*)"|([^\\n]+)))?`,
    'g',
  )
  let relMatch: RegExpExecArray | null
  while ((relMatch = relRe.exec(body)) !== null) {
    const source = erEntityName(relMatch[1], relMatch[2])
    const leftCard = relMatch[3]
    const connector = relMatch[4]
    const rightCard = relMatch[5]
    const target = erEntityName(relMatch[6], relMatch[7])
    const label = (relMatch[8] ?? relMatch[9] ?? '').trim() || undefined
    if (!isValidErEntityName(source) || !isValidErEntityName(target)) continue
    if (groupMap.has(source) || groupMap.has(target)) continue

    if (!entities.has(source)) entities.set(source, [...DEFAULT_ENTITY_ATTRIBUTES])
    if (!entities.has(target)) entities.set(target, [...DEFAULT_ENTITY_ATTRIBUTES])

    relations.push({
      source,
      target,
      label,
      sourceMarker: erCardinalityMarker(leftCard),
      targetMarker: erCardinalityMarker(rightCard),
      // `..` = non-identifying relationship in Mermaid ER
      lineStyle: connector === '..' ? 'dashed' : 'solid',
    })
  }

  // Attribute blocks: must start at line beginning so `||--o{ ORDER` is never
  // read as entity "o" with a `{ ... }` body.
  const blockRe = new RegExp(`(?:^|\\n)\\s*${ER_ENTITY}\\s*\\{([^}]*)\\}`, 'g')
  let blockMatch: RegExpExecArray | null
  while ((blockMatch = blockRe.exec(body)) !== null) {
    const name = erEntityName(blockMatch[1], blockMatch[2])
    if (!isValidErEntityName(name) || groupMap.has(name)) continue
    const attrs = blockMatch[3]
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => normalizeAttributeLine(l.replace(/\s+/g, ' ')))
      .filter(Boolean)
    entities.set(name, attrs.length ? attrs : [...DEFAULT_ENTITY_ATTRIBUTES])
  }

  for (const gid of groupMap.keys()) entities.delete(gid)

  if (entities.size === 0 && groupMap.size === 0) {
    throw new Error('No entities found in erDiagram.')
  }

  const ids = [...entities.keys()]
  const positions = layoutGrid(Math.max(ids.length, 1), 3)
  const shapeNodes: SketchNode[] = ids.map((id, i) => {
    const parentId = entityParent.get(id)
    const validParent = parentId && groupMap.has(parentId) ? parentId : undefined
    return {
      ...makeNode(
        id,
        validParent ? { x: GRID_SIZE * 2, y: GRID_SIZE * 2 } : positions[i],
        {
          label: id,
          shape: 'entity',
          color: '#5b8def',
          attributes: entities.get(id),
        },
        DEFAULT_ENTITY_SIZE,
      ),
      parentId: validParent,
      zIndex: 1,
    }
  })

  const groupNodes: SketchNode[] = [...groupMap.values()].map((g) => ({
    ...makeNode(
      g.id,
      { x: 0, y: 0 },
      { label: g.label, shape: 'group', color: '#6b7c93' },
      DEFAULT_GROUP_SIZE,
    ),
    parentId: g.parentId && groupMap.has(g.parentId) ? g.parentId : undefined,
    zIndex: 0,
  }))

  const nodes = orderNodesParentsFirst([...groupNodes, ...shapeNodes])
  const knownIds = new Set(nodes.map((n) => n.id))
  const rawEdges = relations
    .filter((r) => knownIds.has(r.source) && knownIds.has(r.target))
    .map((r) =>
      makeEdge(r.source, r.target, r.label, {
        sourceMarker: r.sourceMarker,
        targetMarker: r.targetMarker,
        lineStyle: r.lineStyle,
      }),
    )

  const laid = autoLayoutGraph(nodes, rawEdges, 'erd')
  return { nodes: laid.nodes, edges: laid.edges, diagramType: 'erd' }
}

function parseClassDiagram(source: string): MermaidImportResult {
  const lines = stripComments(source).split('\n').slice(1)
  const classes = new Map<
    string,
    { kind: 'class' | 'interface'; attributes: string[]; methods: string[] }
  >()
  const relations: Array<{ source: string; target: string; label?: string }> = []

  let current: string | null = null
  for (const line of lines) {
    const classOpen = line.match(/^(?:class|interface)\s+(\w+)\s*\{?$/)
    if (classOpen) {
      current = classOpen[1]
      const kind = line.startsWith('interface') ? 'interface' : 'class'
      classes.set(current, { kind, attributes: [], methods: [] })
      continue
    }
    if (line === '}' ) {
      current = null
      continue
    }
    if (current && classes.has(current)) {
      const entry = classes.get(current)!
      if (line.includes('(')) entry.methods.push(line)
      else entry.attributes.push(line)
      continue
    }
    const rel = line.match(/(\w+)\s*(--|\.\.|<\|--|--\|>|<\|<|--\*|\*--)\s*(\w+)(?:\s*:\s*(.+))?/)
    if (rel) {
      const [, source, , target, label] = rel
      if (!classes.has(source)) classes.set(source, { kind: 'class', attributes: [], methods: [] })
      if (!classes.has(target)) classes.set(target, { kind: 'class', attributes: [], methods: [] })
      relations.push({ source, target, label: label?.trim() })
    }
  }

  if (classes.size === 0) {
    throw new Error('No classes found in classDiagram.')
  }

  const ids = [...classes.keys()]
  const positions = layoutGrid(ids.length, 3)
  const nodes = ids.map((id, i) => {
    const meta = classes.get(id)!
    return makeNode(
      id,
      positions[i],
      {
        label: id,
        shape: meta.kind,
        color: meta.kind === 'interface' ? '#7dd3a8' : '#5b8def',
        attributes: meta.attributes,
        methods: meta.methods,
      },
      DEFAULT_ENTITY_SIZE,
    )
  })

  const edges: SketchEdge[] = relations.map((r) =>
    makeEdge(r.source, r.target, r.label),
  )

  return { nodes, edges, diagramType: 'uml' }
}

function parseArchitectureFallback(source: string): MermaidImportResult {
  const ids = [...source.matchAll(/(?:service|system|person|boundary|component)\s+"?([\w\s-]+)"?/gi)].map(
    (m, i) => ({ id: `arch_${i}`, label: m[1].trim() }),
  )
  if (ids.length === 0) {
    throw new Error(
      'Architecture / C4 diagrams are best-effort. Try flowchart or erDiagram, or place shapes from the Architecture palette.',
    )
  }
  const positions = layoutGrid(ids.length)
  const nodes = ids.map((item, i) =>
    makeNode(item.id, positions[i], {
      label: item.label,
      shape: 'service',
      color: '#7dd3a8',
    }),
  )
  return { nodes, edges: [], diagramType: 'architecture' }
}

export async function mermaidToFlow(source: string): Promise<MermaidImportResult> {
  const trimmed = source.trim()
  if (!trimmed) throw new Error('Paste Mermaid syntax to import.')

  const diagramType = detectType(trimmed)
  if (diagramType === 'unsupported') {
    throw new Error(
      'Unsupported Mermaid diagram. Supported: flowchart/graph, erDiagram, classDiagram (subset), architecture (best-effort).',
    )
  }

  try {
    await mermaid.parse(trimmed)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid Mermaid syntax.'
    // Mermaid's own parser can fail (DOMPurify) or reject extensions we support
    // (e.g. subgraph inside erDiagram). Our regex importers still handle those.
    const soft =
      diagramType === 'flowchart' ||
      (diagramType === 'erd' && /\bsubgraph\b/i.test(trimmed)) ||
      (/sanitize/i.test(message) || /DOMPurify/i.test(message))
    if (!soft) throw new Error(message)
  }

  switch (diagramType) {
    case 'flowchart':
      return parseFlowchart(trimmed)
    case 'erd':
      return parseErd(trimmed)
    case 'uml':
      return parseClassDiagram(trimmed)
    case 'architecture':
      return parseArchitectureFallback(trimmed)
  }
}

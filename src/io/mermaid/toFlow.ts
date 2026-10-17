import mermaid from 'mermaid'
import type { EdgeLineStyle, EdgeMarkerKind } from '@/canvas/edges/markers'
import { pickHandleSides, toDedicatedHandle } from '@/canvas/edges/routing'
import {
  DEFAULT_ENTITY_ATTRIBUTES,
  normalizeAttributeLine,
} from '@/diagram/entityAttributes'
import {
  DEFAULT_ENTITY_LAYOUT_HEIGHT,
  DEFAULT_ENTITY_SIZE,
  GRID_SIZE,
  snapToGrid,
} from '@/diagram/grid'
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
 */
function parseFlowStatement(
  line: string,
  map: Map<string, FlowNodeMeta>,
  edgeList: Array<{ source: string; target: string; label?: string; lineStyle: EdgeLineStyle }>,
): boolean {
  let rest = line.trim()
  if (!rest || rest === 'end') return false
  if (/^(subgraph|direction|style|classDef|class|linkStyle|click)\b/i.test(rest)) return false

  // Standalone node declaration: id[Label]
  const alone = parseFlowEndpoint(rest, map)
  if (alone && alone.rest.trim() === '') return true

  // Chain: A --> B --> C (consume left-to-right)
  let left = parseFlowEndpoint(rest, map)
  if (!left) return false
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

  return matched || alone !== null
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

  for (const line of lines) {
    parseFlowStatement(line, nodeMap, edgeList)
  }

  if (nodeMap.size === 0) {
    throw new Error('No flowchart nodes found. Check ids and shape syntax (e.g. A[Label] --> B).')
  }

  const ids = [...nodeMap.keys()]
  const positions = layoutGrid(ids.length)
  const nodes = ids.map((id, i) => {
    const meta = nodeMap.get(id)!
    const color =
      meta.shape === 'decision'
        ? '#e8c37a'
        : meta.shape === 'startEnd'
          ? '#7dd3a8'
          : meta.shape === 'database'
            ? '#8b7ec8'
            : '#5b8def'
    return makeNode(id, positions[i], {
      label: meta.label,
      shape: meta.shape,
      color,
    })
  })

  const edges: SketchEdge[] = withGeometricHandles(
    nodes,
    edgeList.map((e) => makeEdge(e.source, e.target, e.label, { lineStyle: e.lineStyle })),
  )

  return { nodes, edges, diagramType: 'flowchart' }
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
  return true
}

function parseErd(source: string): MermaidImportResult {
  const text = stripComments(source)
  const body = text.replace(/^erDiagram\s*/i, '')
  const entities = new Map<string, string[]>()
  const relations: ErdRelation[] = []

  // Relationships first: A ||--o{ B : label  |  A }|..|{ B
  // Supports hyphenated ids (LINE-ITEM) and non-identifying `..`
  const relRe = new RegExp(
    `${ER_ENTITY}\\s+([|o}{]{1,3})(--|\\.\\.)([|o}{]{1,3})\\s+${ER_ENTITY}(?:\\s*:\\s*(?:"([^"]*)"|([^\\n]+)))?`,
    'g',
  )
  let relMatch: RegExpExecArray | null
  while ((relMatch = relRe.exec(text)) !== null) {
    const source = erEntityName(relMatch[1], relMatch[2])
    const leftCard = relMatch[3]
    const connector = relMatch[4]
    const rightCard = relMatch[5]
    const target = erEntityName(relMatch[6], relMatch[7])
    const label = (relMatch[8] ?? relMatch[9] ?? '').trim() || undefined
    if (!isValidErEntityName(source) || !isValidErEntityName(target)) continue

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
    if (!isValidErEntityName(name)) continue
    const attrs = blockMatch[3]
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => normalizeAttributeLine(l.replace(/\s+/g, ' ')))
      .filter(Boolean)
    entities.set(name, attrs.length ? attrs : [...DEFAULT_ENTITY_ATTRIBUTES])
  }

  if (entities.size === 0) {
    throw new Error('No entities found in erDiagram.')
  }

  const ids = [...entities.keys()]
  const positions = layoutGrid(ids.length, 3)
  const nodes = ids.map((id, i) =>
    makeNode(
      id,
      positions[i],
      {
        label: id,
        shape: 'entity',
        color: '#5b8def',
        attributes: entities.get(id),
      },
      DEFAULT_ENTITY_SIZE,
    ),
  )

  const edges: SketchEdge[] = relations.map((r) =>
    makeEdge(r.source, r.target, r.label, {
      sourceMarker: r.sourceMarker,
      targetMarker: r.targetMarker,
      lineStyle: r.lineStyle,
    }),
  )

  return { nodes, edges, diagramType: 'erd' }
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
    // Mermaid's flowchart parse can fail in-browser on DOMPurify; our regex
    // importer still handles the common subset — only hard-fail for ER/UML.
    const soft =
      diagramType === 'flowchart' &&
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

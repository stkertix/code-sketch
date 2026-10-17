/**
 * ERD attribute model.
 *
 * Canonical storage (one line per attribute):
 *   name:datatype:pk/fk
 * Examples:
 *   id:uuid:PK
 *   order_id:int:FK
 *   email:string:UK
 *   name:string:
 *   car_id:int:PK,FK
 *
 * Mermaid erDiagram attribute lines use `type name KEYS`:
 *   string registrationNumber PK
 *   int userId FK
 *   string carRegistrationNumber PK, FK
 */

export type EntityAttribute = {
  name: string
  datatype: string
  /** Key flags joined by comma, e.g. "PK", "FK", "PK,FK", or "". */
  keys: string
}

const KEY_TOKEN = /^(PK|FK|UK)$/i

/** Normalize key list to uppercase comma-joined form without spaces. */
export function normalizeKeys(raw: string | string[] | undefined): string {
  if (!raw) return ''
  const parts = (Array.isArray(raw) ? raw : raw.split(/[,\s]+/))
    .map((k) => k.trim().toUpperCase())
    .filter((k) => KEY_TOKEN.test(k))
  // Unique, stable order: PK, FK, UK
  const order = ['PK', 'FK', 'UK']
  return order.filter((k) => parts.includes(k)).join(',')
}

export function formatEntityAttribute(attr: EntityAttribute): string {
  const keys = normalizeKeys(attr.keys)
  return `${attr.name.trim()}:${attr.datatype.trim()}:${keys}`
}

/**
 * Parse our canonical `name:datatype:keys` line.
 * Also accepts legacy `name : type` / `name: type`.
 */
export function parseColonAttributeLine(line: string): EntityAttribute | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  // name:datatype:keys  (keys optional)
  const triple = trimmed.match(/^([^:]+):([^:]*):(.*)$/)
  if (triple) {
    return {
      name: triple[1].trim(),
      datatype: triple[2].trim() || 'string',
      keys: normalizeKeys(triple[3]),
    }
  }

  // name:datatype  (no keys segment)
  const duo = trimmed.match(/^([^:]+):\s*(.+)$/)
  if (duo) {
    return {
      name: duo[1].trim(),
      datatype: duo[2].trim() || 'string',
      keys: '',
    }
  }

  return {
    name: trimmed,
    datatype: 'string',
    keys: '',
  }
}

/**
 * Parse a Mermaid ER attribute line: `type name [PK|FK|UK,...] ["comment"]`
 */
export function parseMermaidAttributeLine(line: string): EntityAttribute | null {
  let raw = line.trim()
  if (!raw) return null
  // Drop trailing comment
  raw = raw.replace(/\s+"[^"]*"\s*$/, '').trim()

  // If already canonical colon form, prefer that
  if (raw.includes(':') && !/^\S+\s+\S+/.test(raw.split(':')[0] ?? '')) {
    return parseColonAttributeLine(raw)
  }
  if (/^[^:\s]+:[^:\s]/.test(raw)) {
    return parseColonAttributeLine(raw)
  }

  const tokens = raw.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return null

  // Collect trailing KEY tokens (and comma-separated PK,FK)
  const keyParts: string[] = []
  while (tokens.length > 0) {
    const last = tokens[tokens.length - 1]
    const bits = last.split(',').map((b) => b.trim()).filter(Boolean)
    if (bits.length > 0 && bits.every((b) => KEY_TOKEN.test(b))) {
      keyParts.unshift(...bits)
      tokens.pop()
      continue
    }
    // "PK," leftover handling already covered by split
    break
  }

  if (tokens.length === 1) {
    // Only a name (or type) — treat as name with string type
    return {
      name: tokens[0].replace(/^\*/, ''),
      datatype: 'string',
      keys: normalizeKeys(keyParts),
    }
  }

  // Mermaid: first token = type, last remaining = name (supports string(99) firstName)
  const datatype = tokens[0]
  const name = tokens.slice(1).join(' ').replace(/^\*/, '')
  // Leading * on name is alternate Mermaid PK marker
  const starred = /^\*/.test(tokens[1] ?? '')
  const keys = normalizeKeys(starred ? ['PK', ...keyParts] : keyParts)

  return { name, datatype, keys }
}

/** Parse any attribute line (Mermaid or colon) into canonical storage string. */
export function normalizeAttributeLine(line: string): string {
  const trimmed = line.trim()
  if (!trimmed) return ''
  // Prefer Mermaid when it looks like `type name ...`
  const looksMermaid =
    /^\S+\s+\S+/.test(trimmed) && !/^[^:\s]+:[^:\s]/.test(trimmed)
  const parsed = looksMermaid
    ? parseMermaidAttributeLine(trimmed)
    : parseColonAttributeLine(trimmed)
  if (!parsed || !parsed.name) return trimmed
  return formatEntityAttribute(parsed)
}

export function parseAttributeLines(lines: string[]): EntityAttribute[] {
  return lines
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const looksMermaid = /^\S+\s+\S+/.test(l) && !/^[^:\s]+:[^:\s]/.test(l)
      return looksMermaid ? parseMermaidAttributeLine(l) : parseColonAttributeLine(l)
    })
    .filter((a): a is EntityAttribute => !!a && !!a.name)
}

export const DEFAULT_ENTITY_ATTRIBUTES = ['id:uuid:PK', 'name:string:'] as const

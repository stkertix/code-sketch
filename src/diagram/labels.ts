/**
 * Normalize Mermaid / pasted diagram text for canvas display.
 * Handles wrapping quotes, HTML breaks, and common Mermaid escapes.
 */
export function normalizeDiagramText(raw: string | undefined | null): string {
  if (raw == null) return ''
  let s = String(raw).trim()
  // Unwrap one or more layers of matching quotes
  for (let i = 0; i < 3; i++) {
    if (
      (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
      (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
    ) {
      s = s.slice(1, -1).trim()
      continue
    }
    break
  }
  return s
    .replace(/#quot;/gi, '"')
    .replace(/#39;/g, "'")
    .replace(/#lt;/gi, '<')
    .replace(/#gt;/gi, '>')
    .replace(/#amp;/gi, '&')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .trim()
}

export function labelLineCount(label: string | undefined): number {
  const text = label?.trim() ?? ''
  if (!text) return 1
  return text.split('\n').length
}

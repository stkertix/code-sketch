import { useEffect, useMemo, useState } from 'react'
import { downloadText } from '@/io/download'
import { flowToMermaid } from '@/io/mermaid/fromFlow'
import { useDiagramStore } from '@/diagram/store'
import { Icon } from '@/app/shell/Icon'

type Props = {
  open: boolean
  onClose: () => void
}

export function MermaidExportModal({ open, onClose }: Props) {
  const name = useDiagramStore((s) => s.name)
  const diagramType = useDiagramStore((s) => s.diagramType)
  const nodes = useDiagramStore((s) => s.nodes)
  const edges = useDiagramStore((s) => s.edges)

  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)

  const { source, error: buildError } = useMemo(() => {
    if (!open) return { source: '', error: null as string | null }
    try {
      return { source: flowToMermaid(nodes, edges, diagramType), error: null }
    } catch (err) {
      return {
        source: '',
        error: err instanceof Error ? err.message : 'Export failed.',
      }
    }
  }, [open, nodes, edges, diagramType])

  const error = buildError ?? copyError

  useEffect(() => {
    if (!open) {
      setCopied(false)
      setCopyError(null)
    }
  }, [open])

  if (!open) return null

  const safeName = name.replace(/[^\w.-]+/g, '-') || 'diagram'

  const onCopy = async () => {
    if (!source) return
    try {
      await navigator.clipboard.writeText(source)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopyError('Could not copy to clipboard.')
    }
  }

  const onDownload = () => {
    if (!source) return
    downloadText(`${safeName}.mmd`, source, 'text/plain')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-labelledby="mermaid-export-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg border border-[var(--cs-border)] bg-[var(--cs-surface)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--cs-border)] px-4 py-3">
          <h2 id="mermaid-export-title" className="flex items-center gap-2 text-base font-semibold">
            <Icon name="file-export" className="text-[var(--cs-accent)]" />
            Export Mermaid
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded text-[var(--cs-muted)] hover:bg-[var(--cs-surface-2)] hover:text-[var(--cs-text)]"
          >
            <Icon name="cross-small" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-auto px-4 py-4">
          <p className="text-sm text-[var(--cs-muted)]">
            Generated from the current <span className="text-[var(--cs-text)]">{diagramType}</span>{' '}
            diagram. Copy into docs or download a{' '}
            <code className="text-[var(--cs-accent)]">.mmd</code> file.
          </p>

          {error ? (
            <p className="rounded border border-[var(--cs-danger)]/40 bg-[var(--cs-danger)]/10 px-3 py-2 text-sm text-[var(--cs-danger)]">
              {error}
            </p>
          ) : null}

          <textarea
            readOnly
            value={source}
            spellCheck={false}
            className="min-h-[280px] w-full resize-y rounded border border-[var(--cs-border)] bg-[var(--cs-surface-2)] p-3 font-mono text-xs leading-relaxed text-[var(--cs-text)] outline-none"
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--cs-border)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded border border-[var(--cs-border)] px-3 text-sm"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => void onCopy()}
            disabled={!source}
            className="inline-flex h-9 items-center gap-1.5 rounded border border-[var(--cs-border)] bg-[var(--cs-surface-2)] px-3 text-sm disabled:opacity-40"
          >
            <Icon name={copied ? 'check' : 'copy-alt'} className="text-sm" />
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={onDownload}
            disabled={!source}
            className="inline-flex h-9 items-center gap-1.5 rounded bg-[var(--cs-accent)] px-3 text-sm font-medium text-[var(--cs-on-accent)] disabled:opacity-40"
          >
            <Icon name="download" className="text-sm" />
            Download .mmd
          </button>
        </div>
      </div>
    </div>
  )
}

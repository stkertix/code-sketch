import { useRef, useState } from 'react'
import { Icon } from '@/app/shell/Icon'
import { mermaidToFlow } from '@/io/mermaid/toFlow'
import { useDiagramStore } from '@/diagram/store'

type Props = {
  open: boolean
  onClose: () => void
}

const SAMPLE_FLOW = `flowchart TD
  start([Start]) --> decide{Ready?}
  decide -->|Yes| work[Do work]
  decide -->|No| wait[Wait]
  wait --> decide
  work --> done([Done])
  subgraph prep ["Preparation"]
    wait
  end
  subgraph run ["Execution"]
    work
    done
  end`

const SAMPLE_ER = `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER }|..|{ DELIVERY-ADDRESS : uses
    CUSTOMER {
        string name
        string custNumber PK
        string sector
    }
    ORDER {
        int orderNumber PK
        string deliveryAddress
    }
    LINE-ITEM {
        string productCode PK, FK
        int quantity
        float pricePerUnit
    }`

export function MermaidImportModal({ open, onClose }: Props) {
  const [source, setSource] = useState(SAMPLE_ER)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const replaceGraph = useDiagramStore((s) => s.replaceGraph)

  if (!open) return null

  const onImport = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await mermaidToFlow(source)
      if (result.nodes.length === 0) {
        throw new Error('Import produced no shapes. Check the diagram syntax.')
      }
      replaceGraph(result.nodes, result.edges, result.diagramType)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-labelledby="mermaid-import-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg border border-[var(--cs-border)] bg-[var(--cs-surface)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--cs-border)] px-4 py-3">
          <h2 id="mermaid-import-title" className="flex items-center gap-2 text-base font-semibold">
            <Icon name="file-import" className="text-[var(--cs-accent)]" />
            Import Mermaid
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
            Paste Mermaid syntax or upload a <code className="text-[var(--cs-accent)]">.mmd</code> /
            Markdown snippet. Import is one-way — the canvas becomes editable shapes.
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-[var(--cs-border)] bg-[var(--cs-surface-2)] px-3 text-xs"
            >
              <Icon name="upload" className="text-sm" />
              Upload file
            </button>
            <button
              type="button"
              onClick={() => setSource(SAMPLE_FLOW)}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-[var(--cs-border)] bg-[var(--cs-surface-2)] px-3 text-xs"
            >
              <Icon name="file-code" className="text-sm" />
              Flow sample
            </button>
            <button
              type="button"
              onClick={() => setSource(SAMPLE_ER)}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-[var(--cs-border)] bg-[var(--cs-surface-2)] px-3 text-xs"
            >
              <Icon name="file-code" className="text-sm" />
              ER sample
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".mmd,.md,.txt,text/plain,text/markdown"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                setSource(await file.text())
                e.target.value = ''
              }}
            />
          </div>

          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            spellCheck={false}
            className="min-h-[280px] w-full flex-1 rounded border border-[var(--cs-border)] bg-[var(--cs-bg)] p-3 font-['IBM_Plex_Mono',ui-monospace,monospace] text-sm outline-none focus:border-[var(--cs-accent)]"
            placeholder="flowchart TD&#10;  A --> B"
          />

          {error ? (
            <p className="rounded border border-[var(--cs-danger)]/40 bg-[var(--cs-danger)]/10 px-3 py-2 text-sm text-[var(--cs-danger)]">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--cs-border)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded border border-[var(--cs-border)] px-4 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onImport()}
            disabled={loading}
            className="inline-flex h-9 items-center gap-1.5 rounded bg-[var(--cs-accent)] px-4 text-sm font-medium text-[var(--cs-on-accent)] disabled:opacity-50"
          >
            <Icon name={loading ? 'refresh' : 'check-circle'} className="text-sm" />
            {loading ? 'Importing…' : 'Import to canvas'}
          </button>
        </div>
      </div>
    </div>
  )
}

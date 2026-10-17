import { useRef, useState } from 'react'
import {
  downloadText,
  parseDocument,
  serializeDocument,
} from '@/diagram/document'
import { exportPng, exportSvg } from '@/io/image'
import { useDiagramStore } from '@/diagram/store'
import { useThemeStore } from '@/app/theme/store'
import { useUiStore } from '@/app/ui/store'
import { Icon } from '@/app/shell/Icon'
import { MermaidExportModal } from '@/io/mermaid/MermaidExportModal'
import { MermaidImportModal } from '@/io/mermaid/MermaidImportModal'

export function Toolbar() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [mermaidOpen, setMermaidOpen] = useState(false)
  const [mermaidExportOpen, setMermaidExportOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const name = useDiagramStore((s) => s.name)
  const setName = useDiagramStore((s) => s.setName)
  const getDocument = useDiagramStore((s) => s.getDocument)
  const loadDocument = useDiagramStore((s) => s.loadDocument)
  const undo = useDiagramStore((s) => s.undo)
  const redo = useDiagramStore((s) => s.redo)
  const past = useDiagramStore((s) => s.past)
  const future = useDiagramStore((s) => s.future)
  const deleteSelected = useDiagramStore((s) => s.deleteSelected)
  const duplicateSelected = useDiagramStore((s) => s.duplicateSelected)
  const alignSelected = useDiagramStore((s) => s.alignSelected)
  const autoLayout = useDiagramStore((s) => s.autoLayout)
  const bringToFront = useDiagramStore((s) => s.bringToFront)
  const sendToBack = useDiagramStore((s) => s.sendToBack)
  const nodeCount = useDiagramStore((s) => s.nodes.length)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)
  const showDotGrid = useUiStore((s) => s.showDotGrid)
  const toggleDotGrid = useUiStore((s) => s.toggleDotGrid)

  const onSave = () => {
    const doc = getDocument()
    const safe = doc.name.replace(/[^\w.-]+/g, '-') || 'untitled'
    downloadText(`${safe}.codesketch.json`, serializeDocument(doc), 'application/json')
  }

  const onOpen = async (file: File) => {
    const text = await file.text()
    loadDocument(parseDocument(text))
  }

  const onExport = async (kind: 'png' | 'svg') => {
    setBusy(true)
    try {
      if (kind === 'png') await exportPng()
      else await exportSvg()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-[var(--cs-border)] bg-[var(--cs-surface)] px-3">
        <div className="mr-2 flex items-center gap-2">
          <Icon name="diagram-project" className="text-base text-[var(--cs-accent)]" />
          <span className="text-sm font-semibold tracking-wide">Code Sketch</span>
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-8 w-44 rounded border border-[var(--cs-border)] bg-[var(--cs-surface-2)] px-2 text-sm outline-none focus:border-[var(--cs-accent)]"
          aria-label="Document name"
        />

        <Divider />

        <ToolButton icon="disk" label="Save" onClick={onSave} />
        <ToolButton icon="folder-open" label="Open" onClick={() => fileRef.current?.click()} />
        <input
          ref={fileRef}
          type="file"
          accept=".json,.codesketch.json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void onOpen(file)
            e.target.value = ''
          }}
        />

        <ToolButton
          icon="picture"
          label="Export PNG"
          onClick={() => void onExport('png')}
          disabled={busy}
        />
        <ToolButton
          icon="vector"
          label="Export SVG"
          onClick={() => void onExport('svg')}
          disabled={busy}
        />
        <ToolButton icon="file-import" label="Import Mermaid" onClick={() => setMermaidOpen(true)} />
        <ToolButton
          icon="file-export"
          label="Export Mermaid"
          onClick={() => setMermaidExportOpen(true)}
        />

        <Divider />

        <ToolButton icon="undo" label="Undo" onClick={undo} disabled={past.length === 0} />
        <ToolButton icon="redo" label="Redo" onClick={redo} disabled={future.length === 0} />
        <ToolButton
          icon="duplicate"
          label="Duplicate"
          onClick={duplicateSelected}
          keepCanvasSelection
        />
        <ToolButton
          icon="trash"
          label="Delete"
          onClick={deleteSelected}
          keepCanvasSelection
        />
        <ToolButton
          icon="arrows-alt-h"
          label="Align X"
          onClick={() => alignSelected('x')}
          keepCanvasSelection
        />
        <ToolButton
          icon="arrows-alt-v"
          label="Align Y"
          onClick={() => alignSelected('y')}
          keepCanvasSelection
        />
        <ToolButton
          icon="sitemap"
          label="Auto layout"
          onClick={autoLayout}
          disabled={nodeCount === 0}
          keepCanvasSelection
        />
        <ToolButton
          icon="arrow-up"
          label="Bring to front"
          onClick={bringToFront}
          keepCanvasSelection
        />
        <ToolButton
          icon="arrow-down"
          label="Send to back"
          onClick={sendToBack}
          keepCanvasSelection
        />

        <div className="ml-auto flex items-center gap-1.5">
          <ToolButton
            icon={showDotGrid ? 'grid' : 'border-none'}
            label={showDotGrid ? 'Hide line grid' : 'Show line grid'}
            onClick={toggleDotGrid}
          />
          <ToolButton
            icon={theme === 'dark' ? 'brightness' : 'moon'}
            label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            onClick={toggleTheme}
          />
        </div>
      </header>

      <MermaidImportModal open={mermaidOpen} onClose={() => setMermaidOpen(false)} />
      <MermaidExportModal open={mermaidExportOpen} onClose={() => setMermaidExportOpen(false)} />
    </>
  )
}

function Divider() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-[var(--cs-border)]" />
}

function ToolButton({
  icon,
  label,
  onClick,
  disabled,
  keepCanvasSelection,
}: {
  icon: string
  label: string
  onClick: () => void
  disabled?: boolean
  /** Prevent focus steal so React Flow does not clear the current selection. */
  keepCanvasSelection?: boolean
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        onMouseDown={keepCanvasSelection ? (e) => e.preventDefault() : undefined}
        className="inline-flex h-8 w-8 items-center justify-center rounded border border-[var(--cs-border)] bg-[var(--cs-surface-2)] text-[var(--cs-text)] transition hover:border-[var(--cs-accent)] hover:text-[var(--cs-accent)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Icon name={icon} className="text-sm" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-[calc(100%+6px)] z-50 -translate-x-1/2 whitespace-nowrap rounded bg-[var(--cs-tooltip)] px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg ring-1 ring-[var(--cs-border)] transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {label}
        <span className="absolute bottom-full left-1/2 -mb-px h-0 w-0 -translate-x-1/2 border-4 border-transparent border-b-[var(--cs-tooltip)]" />
      </span>
    </div>
  )
}

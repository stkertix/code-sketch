import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Icon } from '@/app/shell/Icon'
import { IconSelect } from '@/panels/inspector/IconSelect'
import { MarkerIcon } from '@/app/shell/MarkerGlyph'
import {
  EDGE_LINE_STYLE_OPTIONS,
  EDGE_MARKER_OPTIONS,
  type EdgeLineStyle,
  type EdgeMarkerKind,
} from '@/diagram/edges'
import { ALL_SHAPE_OPTIONS } from '@/panels/palette/definitions'
import { SHAPE_ICONS } from '@/panels/palette/shapeIcons'
import { normalizeAttributeLine } from '@/diagram/entityAttributes'
import {
  LABEL_ALIGN_X_OPTIONS,
  LABEL_ALIGN_Y_OPTIONS,
  resolveLabelAlignX,
  resolveLabelAlignY,
} from '@/diagram/labelAlign'
import { useUiStore } from '@/app/ui/store'
import { useDiagramStore } from '@/diagram/store'
import type { LabelAlignX, LabelAlignY, ShapeKind } from '@/diagram/types'

function AlignIcon({ kind }: { kind: LabelAlignX | LabelAlignY }) {
  // Compact glyphs: H = uneven lines flush left/center/right; V = bars top/mid/bottom
  if (kind === 'left' || kind === 'center' || kind === 'right') {
    const widths = [10, 7, 10]
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="block">
        {widths.map((w, i) => (
          <rect
            key={i}
            x={kind === 'right' ? 14 - 2 - w : kind === 'center' ? (14 - w) / 2 : 2}
            y={2.5 + i * 3.2}
            width={w}
            height="2"
            rx="0.5"
            fill="currentColor"
          />
        ))}
      </svg>
    )
  }
  const y0 = kind === 'top' ? 2 : kind === 'bottom' ? 6.5 : 4.25
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="block">
      <rect x="2" y={y0} width="10" height="1.75" rx="0.5" fill="currentColor" />
      <rect x="3.5" y={y0 + 2.75} width="7" height="1.75" rx="0.5" fill="currentColor" />
      <rect x="2" y={y0 + 5.5} width="10" height="1.75" rx="0.5" fill="currentColor" />
    </svg>
  )
}

function supportsAttributes(shape: ShapeKind): boolean {
  return shape === 'entity' || shape === 'class' || shape === 'interface'
}

function supportsMethods(shape: ShapeKind): boolean {
  return shape === 'class' || shape === 'interface'
}

const SHAPE_SELECT_OPTIONS = ALL_SHAPE_OPTIONS.map((opt) => ({
  value: opt.shape,
  label: opt.label,
  icon: (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded"
      style={{ background: `${opt.defaultColor}33`, color: opt.defaultColor }}
      aria-hidden
    >
      <Icon name={SHAPE_ICONS[opt.shape]} className="text-[11px]" />
    </span>
  ),
}))

const MARKER_SELECT_OPTIONS = EDGE_MARKER_OPTIONS.map((opt) => ({
  value: opt.value,
  label: opt.label.replace(/^Cardinality: /, ''),
  icon: <MarkerIcon kind={opt.value} title={opt.label} />,
}))

export function Inspector() {
  const selectedNodeId = useDiagramStore((s) => s.selectedNodeId)
  const selectedEdgeId = useDiagramStore((s) => s.selectedEdgeId)
  const nodes = useDiagramStore((s) => s.nodes)
  const edges = useDiagramStore((s) => s.edges)
  const updateSelectedNode = useDiagramStore((s) => s.updateSelectedNode)
  const setSelectedNodeShape = useDiagramStore((s) => s.setSelectedNodeShape)
  const updateSelectedEdge = useDiagramStore((s) => s.updateSelectedEdge)
  const setEdgeMarkers = useDiagramStore((s) => s.setEdgeMarkers)
  const takeSnapshot = useDiagramStore((s) => s.takeSnapshot)

  const node = nodes.find((n) => n.id === selectedNodeId)
  const edge = edges.find((e) => e.id === selectedEdgeId)

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-[var(--cs-border)] px-2.5 py-2">
        <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--cs-muted)]">
          <Icon name="settings" className="text-[10px]" />
          Inspector
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-2.5 py-2">
        {!node && !edge ? <GeneralSettings /> : null}

        {node ? (
          <div className="flex flex-col gap-2">
            <Field label="Label">
              <textarea
                value={node.data.label}
                rows={Math.min(3, Math.max(2, (node.data.label.match(/\n/g)?.length ?? 0) + 1))}
                onFocus={() => takeSnapshot()}
                onKeyDown={(e) => e.stopPropagation()}
                onChange={(e) => updateSelectedNode({ label: e.target.value }, { skipHistory: true })}
                className={labelTextareaClass}
              />
            </Field>
            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-1.5">
              <Field label="Color">
                <input
                  type="color"
                  value={node.data.color}
                  onFocus={() => takeSnapshot()}
                  onChange={(e) =>
                    updateSelectedNode({ color: e.target.value }, { skipHistory: true })
                  }
                  className="h-7 w-full cursor-pointer rounded border border-[var(--cs-border)] bg-transparent"
                />
              </Field>
              <Field label="Shape">
                <IconSelect
                  aria-label="Shape"
                  value={node.data.shape}
                  options={SHAPE_SELECT_OPTIONS}
                  onOpen={takeSnapshot}
                  onChange={(shape) => setSelectedNodeShape(shape, { skipHistory: true })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <Field label="Align H">
                <div
                  className={alignGroupClass}
                  role="group"
                  aria-label="Horizontal label align"
                >
                  {LABEL_ALIGN_X_OPTIONS.map((opt) => {
                    const active = resolveLabelAlignX(node.data) === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        title={opt.label}
                        aria-label={opt.label}
                        aria-pressed={active}
                        onClick={() => {
                          takeSnapshot()
                          updateSelectedNode({ labelAlignX: opt.value }, { skipHistory: true })
                        }}
                        className={`${alignBtnClass} ${active ? alignBtnActiveClass : ''}`}
                      >
                        <AlignIcon kind={opt.value} />
                      </button>
                    )
                  })}
                </div>
              </Field>
              <Field label="Align V">
                <div
                  className={alignGroupClass}
                  role="group"
                  aria-label="Vertical label align"
                >
                  {LABEL_ALIGN_Y_OPTIONS.map((opt) => {
                    const active = resolveLabelAlignY(node.data) === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        title={opt.label}
                        aria-label={opt.label}
                        aria-pressed={active}
                        onClick={() => {
                          takeSnapshot()
                          updateSelectedNode({ labelAlignY: opt.value }, { skipHistory: true })
                        }}
                        className={`${alignBtnClass} ${active ? alignBtnActiveClass : ''}`}
                      >
                        <AlignIcon kind={opt.value} />
                      </button>
                    )
                  })}
                </div>
              </Field>
            </div>
            {supportsAttributes(node.data.shape) ? (
              <LinesField
                key={`${node.id}-attrs`}
                label={
                  node.data.shape === 'entity'
                    ? 'Attributes (name:datatype:pk/fk)'
                    : 'Attributes (one per line)'
                }
                value={node.data.attributes ?? []}
                onFocusSnapshot={takeSnapshot}
                onCommit={(attributes) =>
                  updateSelectedNode(
                    {
                      attributes:
                        node.data.shape === 'entity'
                          ? attributes
                              .map((l) => normalizeAttributeLine(l))
                              .filter(Boolean)
                          : attributes,
                    },
                    { skipHistory: true },
                  )
                }
              />
            ) : null}
            {supportsMethods(node.data.shape) ? (
              <LinesField
                key={`${node.id}-methods`}
                label="Methods (one per line)"
                value={node.data.methods ?? []}
                onFocusSnapshot={takeSnapshot}
                onCommit={(methods) => updateSelectedNode({ methods }, { skipHistory: true })}
              />
            ) : null}
          </div>
        ) : null}

        {edge && !node ? (
          <div className="flex flex-col gap-2">
            <Field label="Label">
              <textarea
                value={typeof edge.label === 'string' ? edge.label : ''}
                rows={Math.min(
                  3,
                  Math.max(
                    2,
                    ((typeof edge.label === 'string' ? edge.label : '').match(/\n/g)?.length ?? 0) +
                      1,
                  ),
                )}
                onFocus={() => takeSnapshot()}
                onKeyDown={(e) => e.stopPropagation()}
                onChange={(e) =>
                  updateSelectedEdge({ label: e.target.value }, { skipHistory: true })
                }
                className={labelTextareaClass}
              />
            </Field>
            <div className="grid grid-cols-2 gap-1.5">
              <Field label="Path">
                <select
                  value={edge.type === 'orthogonal' ? 'smoothstep' : (edge.type ?? 'smoothstep')}
                  onFocus={() => takeSnapshot()}
                  onChange={(e) =>
                    updateSelectedEdge({ type: e.target.value }, { skipHistory: true })
                  }
                  className={inputClass}
                >
                  <option value="smoothstep">Orthogonal</option>
                  <option value="step">Sharp</option>
                  <option value="default">Bezier</option>
                  <option value="straight">Straight</option>
                </select>
              </Field>
              <Field label="Stroke">
                <select
                  value={(edge.data?.lineStyle as EdgeLineStyle | undefined) ?? 'solid'}
                  onFocus={() => takeSnapshot()}
                  onChange={(e) =>
                    updateSelectedEdge(
                      {
                        data: {
                          ...edge.data,
                          lineStyle: e.target.value as EdgeLineStyle,
                        },
                      },
                      { skipHistory: true },
                    )
                  }
                  className={inputClass}
                >
                  {EDGE_LINE_STYLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Source">
              <EndpointControls
                side={parseHandleSide(edge.sourceHandle)}
                marker={(edge.data?.sourceMarker as EdgeMarkerKind | undefined) ?? 'none'}
                onSide={(sourceHandle) =>
                  updateSelectedEdge({ sourceHandle }, { skipHistory: true })
                }
                onMarker={(sourceMarker) =>
                  setEdgeMarkers({ sourceMarker }, { skipHistory: true })
                }
              />
            </Field>
            <Field label="Target">
              <EndpointControls
                side={parseHandleSide(edge.targetHandle)}
                marker={(edge.data?.targetMarker as EdgeMarkerKind | undefined) ?? 'arrow'}
                onSide={(targetHandle) =>
                  updateSelectedEdge({ targetHandle }, { skipHistory: true })
                }
                onMarker={(targetMarker) =>
                  setEdgeMarkers({ targetMarker }, { skipHistory: true })
                }
              />
            </Field>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function LinesField({
  label,
  value,
  onCommit,
  onFocusSnapshot,
}: {
  label: string
  value: string[]
  onCommit: (lines: string[]) => void
  onFocusSnapshot: () => void
}) {
  const [text, setText] = useState(() => value.join('\n'))
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const flush = (next: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    onCommit(next.split('\n'))
  }

  const stopKeys = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation()
  }

  return (
    <div className="block">
      <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-[var(--cs-muted)]">
        {label}
      </span>
      <textarea
        value={text}
        rows={3}
        onFocus={onFocusSnapshot}
        onKeyDown={stopKeys}
        onKeyUp={stopKeys}
        onChange={(e) => {
          const next = e.target.value
          setText(next)
          if (timerRef.current) clearTimeout(timerRef.current)
          timerRef.current = setTimeout(() => onCommit(next.split('\n')), 250)
        }}
        onBlur={() => flush(text)}
        className={`${textareaClass} min-h-[3.5rem] resize-y`}
        placeholder={'id : uuid\nname : string'}
      />
    </div>
  )
}

type HandleSide = 'top' | 'right' | 'bottom' | 'left'

const HANDLE_SIDE_OPTIONS: Array<{ value: HandleSide; label: string }> = [
  { value: 'top', label: 'Top' },
  { value: 'right', label: 'Right' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'left', label: 'Left' },
]

function parseHandleSide(handle: string | null | undefined): HandleSide | '' {
  const base = handle?.split(':')[0]
  if (base === 'top' || base === 'right' || base === 'bottom' || base === 'left') {
    return base
  }
  return ''
}

function EndpointControls({
  side,
  marker,
  onSide,
  onMarker,
}: {
  side: HandleSide | ''
  marker: EdgeMarkerKind
  onSide: (side: HandleSide) => void
  onMarker: (kind: EdgeMarkerKind) => void
}) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-1.5">
      <select
        value={side}
        aria-label="Side"
        onFocus={() => useDiagramStore.getState().takeSnapshot()}
        onChange={(e) => {
          const v = e.target.value as HandleSide | ''
          if (v) onSide(v)
        }}
        className={inputClass}
      >
        <option value="" disabled>
          Side
        </option>
        {HANDLE_SIDE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <IconSelect
        aria-label="Marker"
        value={marker}
        options={MARKER_SELECT_OPTIONS}
        onOpen={() => useDiagramStore.getState().takeSnapshot()}
        onChange={onMarker}
      />
    </div>
  )
}

function GeneralSettings() {
  const showDotGrid = useUiStore((s) => s.showDotGrid)
  const setShowDotGrid = useUiStore((s) => s.setShowDotGrid)
  const showEdgeArcs = useUiStore((s) => s.showEdgeArcs)
  const setShowEdgeArcs = useUiStore((s) => s.setShowEdgeArcs)

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] uppercase tracking-wider text-[var(--cs-muted)]">General</p>
      <ToggleRow
        label="Show grid"
        checked={showDotGrid}
        onChange={setShowDotGrid}
      />
      <ToggleRow
        label="Show arc line"
        checked={showEdgeArcs}
        onChange={setShowEdgeArcs}
      />
    </div>
  )
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <label className="flex h-7 cursor-pointer items-center justify-between gap-2 rounded border border-[var(--cs-border)] bg-[var(--cs-surface-2)] px-2 text-xs text-[var(--cs-text)]">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-[var(--cs-accent)]"
      />
    </label>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="block">
      <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-[var(--cs-muted)]">
        {label}
      </span>
      {children}
    </div>
  )
}

const inputClass =
  'h-7 w-full rounded border border-[var(--cs-border)] bg-[var(--cs-surface-2)] px-1.5 text-xs outline-none focus:border-[var(--cs-accent)]'

const textareaClass =
  'w-full rounded border border-[var(--cs-border)] bg-[var(--cs-surface-2)] px-1.5 py-0.5 text-[11px] leading-snug outline-none focus:border-[var(--cs-accent)]'

const labelTextareaClass =
  'min-h-[2.5rem] w-full resize-y rounded border border-[var(--cs-border)] bg-[var(--cs-surface-2)] px-1.5 py-1 text-[10px] leading-snug outline-none focus:border-[var(--cs-accent)] [font-size:10px]'

const alignGroupClass =
  'flex h-7 w-full overflow-hidden rounded border border-[var(--cs-border)] bg-[var(--cs-surface-2)]'

const alignBtnClass =
  'flex h-full flex-1 items-center justify-center text-[var(--cs-muted)] transition-colors hover:bg-[var(--cs-surface)] hover:text-[var(--cs-text)]'

const alignBtnActiveClass =
  'bg-[var(--cs-accent)] text-[var(--cs-on-shape)] hover:bg-[var(--cs-accent)] hover:text-[var(--cs-on-shape)]'

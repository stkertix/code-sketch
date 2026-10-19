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
import { useDiagramStore } from '@/diagram/store'
import type { ShapeKind } from '@/diagram/types'

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
      className="inline-flex h-7 w-7 items-center justify-center rounded"
      style={{ background: `${opt.defaultColor}33`, color: opt.defaultColor }}
      aria-hidden
    >
      <Icon name={SHAPE_ICONS[opt.shape]} className="text-sm" />
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
    <aside className="flex w-64 shrink-0 flex-col border-l border-[var(--cs-border)] bg-[var(--cs-surface)]">
      <div className="border-b border-[var(--cs-border)] px-3 py-3">
        <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[var(--cs-muted)]">
          <Icon name="settings" className="text-xs" />
          Inspector
        </p>
      </div>

      <div className="flex-1 overflow-auto px-3 py-3">
        {!node && !edge ? (
          <p className="text-sm text-[var(--cs-muted)]">
            Select a shape or connector to edit its properties.
          </p>
        ) : null}

        {node ? (
          <div className="flex flex-col gap-3">
            <Field label="Label">
              <input
                value={node.data.label}
                onFocus={() => takeSnapshot()}
                onKeyDown={(e) => e.stopPropagation()}
                onChange={(e) => updateSelectedNode({ label: e.target.value }, { skipHistory: true })}
                className={inputClass}
              />
            </Field>
            <Field label="Color">
              <input
                type="color"
                value={node.data.color}
                onFocus={() => takeSnapshot()}
                onChange={(e) => updateSelectedNode({ color: e.target.value }, { skipHistory: true })}
                className="h-9 w-full cursor-pointer rounded border border-[var(--cs-border)] bg-transparent"
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
          <div className="flex flex-col gap-3">
            <Field label="Label">
              <input
                value={typeof edge.label === 'string' ? edge.label : ''}
                onFocus={() => takeSnapshot()}
                onChange={(e) =>
                  updateSelectedEdge({ label: e.target.value }, { skipHistory: true })
                }
                className={inputClass}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
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
    </aside>
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
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-[var(--cs-muted)]">
        {label}
      </span>
      <textarea
        value={text}
        rows={5}
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
        className={inputClass}
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
    <div className="flex flex-col gap-1.5">
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-[var(--cs-muted)]">
        {label}
      </span>
      {children}
    </div>
  )
}

const inputClass =
  'w-full rounded border border-[var(--cs-border)] bg-[var(--cs-surface-2)] px-2 py-2 text-sm outline-none focus:border-[var(--cs-accent)]'

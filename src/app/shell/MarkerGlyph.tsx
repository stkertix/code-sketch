import type { EdgeMarkerKind } from '@/diagram/edges'

const strokeProps = {
  fill: 'none' as const,
  strokeWidth: 2.25,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** Three toes meeting at the tip (along −X); open prongs toward +X (into the node). */
function CrowFoot({ color, openX = 0 }: { color: string; openX?: number }) {
  const tip = openX - 16
  return (
    <>
      <path d={`M ${openX} -9 L ${tip} 0`} {...strokeProps} stroke={color} />
      <path d={`M ${openX} 0 L ${tip} 0`} {...strokeProps} stroke={color} />
      <path d={`M ${openX} 9 L ${tip} 0`} {...strokeProps} stroke={color} />
    </>
  )
}

function OneBar({ color, x = 0 }: { color: string; x?: number }) {
  return (
    <path
      d={`M ${x} -10 L ${x} 10`}
      fill="none"
      stroke={color}
      strokeWidth={2.75}
      strokeLinecap="round"
    />
  )
}

function ZeroCircle({
  color,
  outline,
  cx = -5,
}: {
  color: string
  outline: string
  cx?: number
}) {
  return <circle cx={cx} cy={0} r={5} fill={outline} stroke={color} strokeWidth={2.5} />
}

/** Shared SVG geometry for edge endpoint markers (+X = into the node). */
export function MarkerGlyph({
  kind,
  color,
  outline = 'var(--cs-canvas, #12151e)',
}: {
  kind: EdgeMarkerKind
  color: string
  outline?: string
}) {
  switch (kind) {
    case 'none':
      return (
        <path
          d="M -12 0 L 0 0"
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray="3 3"
        />
      )
    case 'arrow':
      return (
        <path
          d="M -15 -8 L 0 0 L -15 8 Z"
          fill={color}
          stroke={outline}
          strokeWidth={1.25}
          strokeLinejoin="round"
        />
      )
    case 'arrowOpen':
      return (
        <path
          d="M -15 -8 L 0 0 L -15 8"
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
    case 'many':
      return <CrowFoot color={color} />
    case 'one':
      return <OneBar color={color} />
    case 'zero':
      return <ZeroCircle color={color} outline={outline} />
    case 'zeroOrOne':
      return (
        <>
          <OneBar color={color} x={0} />
          <ZeroCircle color={color} outline={outline} cx={-14} />
        </>
      )
    case 'zeroOrMany':
      return (
        <>
          <CrowFoot color={color} />
          <ZeroCircle color={color} outline={outline} cx={-22} />
        </>
      )
    case 'oneOrMany':
      return (
        <>
          <CrowFoot color={color} />
          <OneBar color={color} x={-20} />
        </>
      )
    case 'dot':
      return (
        <circle cx={-5} cy={0} r={5} fill={color} stroke={outline} strokeWidth={1.25} />
      )
    case 'circle':
      return (
        <circle cx={-5} cy={0} r={5} fill={outline} stroke={color} strokeWidth={2.5} />
      )
    default:
      return null
  }
}

/** Compact icon for picker / toolbars. Tip points right (into “node”). */
export function MarkerIcon({
  kind,
  title,
  className = '',
  color = 'currentColor',
}: {
  kind: EdgeMarkerKind
  title?: string
  className?: string
  color?: string
}) {
  return (
    <svg
      className={className}
      width={36}
      height={20}
      viewBox="-28 -12 32 24"
      overflow="visible"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      <g transform="scale(0.55)">
        <MarkerGlyph kind={kind} color={color} outline="var(--cs-surface-2, #1a1f2b)" />
      </g>
    </svg>
  )
}

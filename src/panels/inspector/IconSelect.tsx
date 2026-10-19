import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@/app/shell/Icon'

export type IconSelectOption<T extends string> = {
  value: T
  label: string
  icon: ReactNode
}

type Props<T extends string> = {
  value: T
  options: Array<IconSelectOption<T>>
  onChange: (value: T) => void
  onOpen?: () => void
  className?: string
  'aria-label'?: string
}

function computeMenuStyle(anchor: DOMRect): CSSProperties {
  const gap = 2
  const maxH = 200
  const spaceBelow = window.innerHeight - anchor.bottom - gap - 8
  const spaceAbove = anchor.top - gap - 8
  const openUp = spaceBelow < 120 && spaceAbove > spaceBelow
  const height = Math.max(80, Math.min(maxH, openUp ? spaceAbove : spaceBelow))

  return {
    position: 'fixed',
    left: Math.max(8, Math.min(anchor.left, window.innerWidth - Math.max(anchor.width, 140) - 8)),
    width: Math.max(anchor.width, 140),
    zIndex: 10000,
    maxHeight: height,
    ...(openUp
      ? { bottom: window.innerHeight - anchor.top + gap, top: 'auto' }
      : { top: anchor.bottom + gap, bottom: 'auto' }),
  }
}

/**
 * Select-like control with custom option previews.
 * Menu is portaled to document.body so parent overflow cannot clip it.
 */
export function IconSelect<T extends string>({
  value,
  options,
  onChange,
  onOpen,
  className = '',
  'aria-label': ariaLabel,
}: Props<T>) {
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const listId = useId()

  const selected = options.find((o) => o.value === value) ?? options[0]

  const close = useCallback(() => {
    setOpen(false)
    setMenuStyle(null)
  }, [])

  const syncPosition = useCallback(() => {
    const el = anchorRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    // Hide if the trigger scrolled fully off-screen
    if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) {
      close()
      return
    }
    setMenuStyle(computeMenuStyle(r))
  }, [close])

  const toggle = () => {
    if (open) {
      close()
      return
    }
    const el = anchorRef.current
    if (!el) return
    onOpen?.()
    setMenuStyle(computeMenuStyle(el.getBoundingClientRect()))
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return

    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (anchorRef.current?.contains(t) || menuRef.current?.contains(t)) return
      close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    const onScrollOrResize = (e: Event) => {
      // Keep menu open while scrolling its own list
      if (e.type === 'scroll' && menuRef.current?.contains(e.target as Node)) return
      syncPosition()
    }

    const timer = window.setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown, true)
      document.addEventListener('keydown', onKey)
      window.addEventListener('resize', onScrollOrResize)
      // capture: true catches scroll on nested inspector panels
      window.addEventListener('scroll', onScrollOrResize, true)
    }, 0)

    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onScrollOrResize)
      window.removeEventListener('scroll', onScrollOrResize, true)
    }
  }, [open, close, syncPosition])

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={toggle}
        className={`flex h-7 w-full items-center gap-1.5 rounded border border-[var(--cs-border)] bg-[var(--cs-surface-2)] px-1.5 text-left text-xs outline-none focus:border-[var(--cs-accent)] ${className}`}
      >
        <span className="flex shrink-0 items-center justify-center">{selected?.icon}</span>
        <span className="min-w-0 flex-1 truncate">{selected?.label}</span>
        <Icon name="angle-small-down" className="shrink-0 text-[10px] text-[var(--cs-muted)]" />
      </button>

      {open && menuStyle
        ? createPortal(
            <ul
              ref={menuRef}
              id={listId}
              role="listbox"
              style={menuStyle}
              className="overflow-auto rounded border border-[var(--cs-border)] bg-[var(--cs-surface)] py-0.5 shadow-xl"
            >
              {options.map((opt) => {
                const isSelected = opt.value === value
                return (
                  <li key={opt.value} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onChange(opt.value)
                        close()
                      }}
                      className={`flex w-full items-center gap-1.5 px-1.5 py-1 text-left text-xs transition-colors ${
                        isSelected
                          ? 'bg-[var(--cs-accent)]/15 text-[var(--cs-accent)]'
                          : 'text-[var(--cs-text)] hover:bg-[var(--cs-surface-2)]'
                      }`}
                    >
                      <span className="flex shrink-0 items-center justify-center">{opt.icon}</span>
                      <span className="truncate">{opt.label}</span>
                    </button>
                  </li>
                )
              })}
            </ul>,
            document.body,
          )
        : null}
    </>
  )
}

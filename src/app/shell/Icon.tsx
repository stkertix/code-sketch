type IconProps = {
  name: string
  className?: string
  label?: string
}

/** Flaticon Uicons (regular rounded): class `fi fi-rr-{name}` */
export function Icon({ name, className = '', label }: IconProps) {
  return (
    <i
      className={`fi fi-rr-${name} leading-none ${className}`.trim()}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    />
  )
}

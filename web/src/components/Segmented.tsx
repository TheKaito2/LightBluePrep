/**
 * One choice out of a few, as a segmented control (spec 7.5) that behaves as a
 * radio group: a fieldset and legend for the label, role="radio" items with
 * aria-checked, one Tab stop (the checked item) and arrow keys that move and
 * pick, as native radios do. A row of aria-pressed buttons was announced as
 * independent toggles (H-37).
 */
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'

interface Props<T> {
  legend: string
  options: readonly { value: T; label: ReactNode }[]
  value: T
  onChange: (next: T) => void
  /** Greys the whole group out; `hint` should then say why. */
  disabled?: boolean
  /** A line under the control, read out with the group. */
  hint?: ReactNode
  /** Sits beside the track, after it (Order's Reshuffle). */
  aside?: ReactNode
  /** Keep the legend for screen readers only, where the options name themselves. */
  hideLegend?: boolean
  className?: string
}

const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

export function Segmented<T extends string | number>({
  legend, options, value, onChange, disabled, hint, aside, hideLegend, className,
}: Props<T>) {
  const id = useId()
  const track = useRef<HTMLDivElement>(null)
  const at = options.findIndex((o) => o.value === value)

  // Where the track scrolls sideways (Review's piles on a phone), keep the
  // checked item in view: the default there is the last one.
  useEffect(() => {
    const line = track.current?.parentElement
    const b = track.current?.querySelectorAll<HTMLElement>('[role=radio]')[at]
    if (!line || !b || line.scrollWidth <= line.clientWidth) return
    const l = line.getBoundingClientRect(), r = b.getBoundingClientRect()
    const pad = parseFloat(getComputedStyle(line).paddingRight) || 0
    if (r.right > l.right - pad) line.scrollLeft += r.right - l.right + pad
    else if (r.left < l.left) line.scrollLeft -= l.left - r.left
  }, [at])

  function onKey(e: KeyboardEvent) {
    const n = options.length
    const step = STEP[e.key]
    const next = step !== undefined ? (Math.max(at, 0) + step + n) % n
      : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1
    if (next < 0) return
    e.preventDefault()
    onChange(options[next]!.value)
    track.current?.querySelectorAll<HTMLElement>('[role=radio]')[next]?.focus()
  }

  return (
    <fieldset className={className ? `field ${className}` : 'field'} disabled={disabled}>
      <legend className={hideLegend ? 'side-t sr-only' : 'side-t'} id={`${id}-l`}>{legend}</legend>
      <div className="field-line">
        <div ref={track} className="seg" role="radiogroup" aria-labelledby={`${id}-l`}
             aria-describedby={hint ? `${id}-h` : undefined} aria-disabled={disabled || undefined} onKeyDown={onKey}>
          {options.map((o, i) => (
            <button key={String(o.value)} type="button" role="radio" aria-checked={i === at}
                    // Nothing checked still leaves one way in.
                    tabIndex={i === at || (at < 0 && i === 0) ? 0 : -1}
                    className={i === at ? 'seg-b on' : 'seg-b'} onClick={() => onChange(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
        {aside}
      </div>
      {hint ? <p className="field-hint" id={`${id}-h`}>{hint}</p> : null}
    </fieldset>
  )
}

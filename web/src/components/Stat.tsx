/**
 * Stat tile (spec 7.7): label, number, optional sub line and meter, top to
 * bottom. Used in the page-head strip, the score card footer and Settings.
 * Tiles that belong together go in one <StatGroup>: a single bordered box
 * with hairline dividers, never separate floating cards.
 */
import type { ReactNode } from 'react'

interface Props {
  label: ReactNode
  /** Omit for a meter-only tile (Stats' bank coverage): the meter takes its place. */
  value?: ReactNode
  /** Small text after the number: "%", "/ 1600", "min". */
  unit?: ReactNode
  sub?: ReactNode
  /** 0 to 1. Draws a 6px meter under the tile; omit for none. */
  meter?: number
  /** 'l' is the larger number used in a page-head band. */
  size?: 'm' | 'l'
  className?: string
}

export function Stat({ label, value, unit, sub, meter, size = 'm', className }: Props) {
  const pct = meter === undefined ? 0 : Math.round(Math.min(1, Math.max(0, meter)) * 100)
  return (
    <div className={className ? `stat ${className}` : 'stat'}>
      <span className="stat-l">{label}</span>
      {value === undefined ? null : (
        <span className={size === 'l' ? 'stat-n l' : 'stat-n'}>
          {value}{unit ? <small>{unit}</small> : null}
        </span>
      )}
      {sub ? <span className="stat-sub">{sub}</span> : null}
      {meter === undefined ? null : (
        // A fill is drawn only above zero; at zero the empty track says enough.
        <span className="meter" aria-hidden="true">
          {pct > 0 ? <span className="meter-fill" style={{ width: `${pct}%` }} /> : null}
        </span>
      )}
    </div>
  )
}

export function StatGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className ? `stat-group ${className}` : 'stat-group'}>{children}</div>
}

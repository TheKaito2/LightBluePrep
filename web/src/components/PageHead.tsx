/**
 * The solid colour band at the top of every page. Each page owns a tone, so
 * the app has a colour per place: Home light blue, Review amber, Stats mint,
 * About dark ink. Flat colour only, no gradients.
 */
import type { ReactNode } from 'react'

export type Tone = 'amber' | 'mint' | 'ink' | 'rose'

export function PageHead({ tone, eyebrow, title, sub, children }: {
  tone: Tone
  eyebrow?: string
  title: ReactNode
  sub?: ReactNode
  /** Right-hand side on desktop, below the title on phones. */
  children?: ReactNode
}) {
  return (
    <section className={`phead tone-${tone}`}>
      <div className="phead-in">
        <div className="phead-copy">
          {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          <h1 className="phead-t" tabIndex={-1}>{title}</h1>
          {sub ? <p className="phead-sub">{sub}</p> : null}
        </div>
        {children ? <div className="phead-aside">{children}</div> : null}
      </div>
    </section>
  )
}

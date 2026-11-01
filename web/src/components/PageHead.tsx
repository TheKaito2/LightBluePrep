/**
 * The flat band at the top of every page except Home, which keeps its own
 * hero. One colour per page; `ink` for About and the inbox, `grey` for
 * Settings, and `section` for a finished set (its --sec-fill, or ink when the
 * set mixes sections).
 *
 * The aside is the stat strip: one <StatGroup> of <Stat size="l"> cells.
 * Results also uses `back` (a link above everything) and `foot` (chips under
 * the sub). `media` is Bulb, beside the copy.
 */
import type { ReactNode } from 'react'
import type { Section } from '../types'

export type Tone = 'ink' | 'grey' | 'section' | 'blue' | 'mint' | 'amber' | 'violet'

export function PageHead({ tone, section, eyebrow, title, sub, back, media, foot, children }: {
  tone: Tone
  /** Only for tone 'section': which colour. Omit for a mixed set (ink). */
  section?: Section
  eyebrow?: string
  title: ReactNode
  sub?: ReactNode
  back?: ReactNode
  media?: ReactNode
  foot?: ReactNode
  /** Right-hand side on desktop, full width below the sub on phones. */
  children?: ReactNode
}) {
  return (
    <section className={`phead tone-${tone}${section ? ` sec-${section}` : ''}`}>
      <div className={`phead-in${back ? ' has-back' : ''}${media ? ' has-media' : ''}`}>
        {back ? <div className="phead-back">{back}</div> : null}
        {media ? <div className="phead-media">{media}</div> : null}
        <div className="phead-copy">
          {eyebrow ? <span className="phead-eyebrow">{eyebrow}</span> : null}
          <h1 className="phead-t" tabIndex={-1}>{title}</h1>
          {sub ? <p className="phead-sub">{sub}</p> : null}
          {foot ? <div className="phead-foot">{foot}</div> : null}
        </div>
        {children ? <div className="phead-aside">{children}</div> : null}
      </div>
    </section>
  )
}

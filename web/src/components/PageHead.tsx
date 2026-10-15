/**
 * The flat band at the top of every page except Home, which keeps its own
 * light hero. Three tones, each with a job: ink for the content pages, grey
 * for Settings so it no longer looks like About, and section for a finished
 * set (its --sec-700, or ink when the set mixes sections).
 *
 * The aside is the stat strip: one <StatGroup> of <Stat size="l"> cells.
 * Results also uses `back` (a link above everything), `media` (Bulb beside
 * the copy) and `foot` (chips under the sub).
 */
import type { ReactNode } from 'react'
import type { Section } from '../types'

export type Tone = 'ink' | 'grey' | 'section'

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
          {/* The eyebrow line is always there, empty or not, so the title sits
              at the same height on every tab. */}
          <span className="phead-eyebrow" aria-hidden={eyebrow ? undefined : true}>{eyebrow}</span>
          <h1 className="phead-t" tabIndex={-1}>{title}</h1>
          {sub ? <p className="phead-sub">{sub}</p> : null}
          {foot ? <div className="phead-foot">{foot}</div> : null}
        </div>
        {children ? <div className="phead-aside">{children}</div> : null}
      </div>
    </section>
  )
}

/**
 * Free resources worth using next to LightBluePrep, with the owner's take on
 * each. Free only: nothing here is paid or affiliate-linked.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from './Icon'
import { PageHead } from './PageHead'

interface Resource {
  name: string
  by: string
  url: string
  cta: string
  icon: 'book' | 'play'
  tags: string[]
  what: string
  take: string
  goat?: boolean
}

// No "Free" tag: the eyebrow already says every link here is free.
const RESOURCES: Resource[] = [
  {
    name: 'Official Digital SAT Prep',
    by: 'Khan Academy',
    url: 'https://www.khanacademy.org/digital-sat',
    cta: 'Open Khan Academy',
    icon: 'book',
    tags: ['Lessons', 'Practice', 'Made with College Board'],
    what: 'Video lessons, articles and practice for every skill on the Digital SAT, built with College Board.',
    take:
      'When a skill keeps showing up red on my Stats page, this is where I go to actually learn it. '
      + 'It is slow and thorough and explains things from zero, which is exactly what you want for a '
      + 'topic you never really understood.',
  },
  {
    name: 'James Lu SAT',
    by: 'James Lu · YouTube',
    url: 'https://www.youtube.com/@JamesLuSAT',
    cta: 'Watch on YouTube',
    icon: 'play',
    tags: ['Strategy', 'Desmos tricks', 'Test walkthroughs'],
    what: 'Fast, no-fluff walkthroughs of real SAT questions, grammar rules, Desmos shortcuts and full timed Bluebook test runs.',
    take:
      'James Lu is the GOAT. No filler, he just shows you the fastest way to get real questions right. '
      + 'Watch one of his timed test walkthroughs to see how a top scorer actually thinks, then come '
      + 'back here and drill that topic.',
    goat: true,
  },
]

function ResourceCard({ r }: { r: Resource }) {
  // The take is clamped to four lines on a phone only (CSS); "Read more"
  // shows only when the clamp is actually hiding something.
  const take = useRef<HTMLQuoteElement>(null)
  const [clipped, setClipped] = useState(false)
  const [open, setOpen] = useState(false)
  const id = useId()
  useEffect(() => {
    const el = take.current
    if (!el) return
    const check = () => setClipped(el.scrollHeight > el.clientHeight + 1)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <article className="rcard">
      <div className="rcard-top">
        <span className="rcard-ico" aria-hidden="true"><Icon name={r.icon} size={24} strokeWidth={2} /></span>
        <div className="rcard-id">
          <h2 className="rcard-t">
            {r.name}
            {r.goat ? (
              <span className="goat">
                <Icon name="star" size={13} strokeWidth={2.4} /> GOAT<span className="sr-only">, greatest of all time</span>
              </span>
            ) : null}
          </h2>
          <span className="rcard-by">{r.by}</span>
        </div>
      </div>
      <ul className="rcard-tags" aria-label="Topics">
        {r.tags.map((t) => <li key={t}>{t}</li>)}
      </ul>
      <p className="rcard-what">{r.what}</p>
      <figure className="rcard-take">
        <figcaption>My take</figcaption>
        <blockquote id={id} ref={take} className={open ? 'open' : undefined}>{r.take}</blockquote>
        {clipped || open ? (
          <button type="button" className="rcard-more" aria-expanded={open} aria-controls={id}
                  onClick={() => setOpen((o) => !o)}>
            {open ? 'Show less' : 'Read more'}
          </button>
        ) : null}
      </figure>
      <a className="btn rcard-go" href={r.url} target="_blank" rel="noreferrer">
        {r.cta}<span className="sr-only"> (opens in a new tab)</span>
        <Icon name="external" size={16} strokeWidth={2.2} />
      </a>
    </article>
  )
}

export function Resources() {
  return (
    <>
      <PageHead tone="ink" eyebrow="Free · hand-picked" title="Resources"
                sub="Free resources worth your time next to LightBluePrep, and how to use each one." />
      <div className="resources">
        {RESOURCES.map((r) => <ResourceCard key={r.name} r={r} />)}
        <section className="res-next">
          <div>
            <h2>Found your weak skill? Drill it here.</h2>
            <p>Stats lists the skills you miss most, and one click starts practice on any of them.</p>
          </div>
          <a className="btn" href="#stats">
            Open Stats <Icon name="arrow-right" size={16} strokeWidth={2.2} />
          </a>
        </section>
        <p className="resources-note">
          Not affiliated with Khan Academy or James Lu. Both links go to free content.
        </p>
      </div>
    </>
  )
}

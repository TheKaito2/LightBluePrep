/**
 * Free resources worth using next to LightBluePrep, with the owner's take on
 * each. Free only: nothing here is paid or affiliate-linked.
 */
import { Icon } from './Icon'
import { PageHead } from './PageHead'

interface Resource {
  name: string
  by: string
  url: string
  cta: string
  icon: 'book' | 'play'
  tone: 'mint' | 'rose'
  tags: string[]
  what: string
  take: string
  goat?: boolean
}

const RESOURCES: Resource[] = [
  {
    name: 'Official Digital SAT Prep',
    by: 'Khan Academy',
    url: 'https://www.khanacademy.org/digital-sat',
    cta: 'Open Khan Academy',
    icon: 'book',
    tone: 'mint',
    tags: ['Free', 'Lessons', 'Practice', 'Made with College Board'],
    what: 'Video lessons, articles and practice for every skill on the Digital SAT, built with College Board.',
    take:
      'When a skill keeps showing up red on my Stats page, this is where I go to actually learn it. '
      + 'It is slow and thorough and explains things from zero, which is exactly what you want for a '
      + 'topic you never really understood.',
  },
  {
    name: 'James Lu SAT',
    by: 'YouTube',
    url: 'https://www.youtube.com/@JamesLuSAT',
    cta: 'Watch on YouTube',
    icon: 'play',
    tone: 'rose',
    tags: ['Free', 'Strategy', 'Desmos tricks', 'Test walkthroughs'],
    what: 'Fast, no-fluff walkthroughs of real SAT questions, grammar rules, Desmos shortcuts and full timed Bluebook test runs.',
    take:
      'James Lu is the GOAT. No filler, he just shows you the fastest way to get real questions right. '
      + 'Watch one of his timed test walkthroughs to see how a top scorer actually thinks, then come '
      + 'back here and drill that topic.',
    goat: true,
  },
]

export function Resources() {
  return (
    <>
      <PageHead tone="rose" eyebrow="Free · hand-picked" title="Resources"
                sub="The free stuff I actually use alongside LightBluePrep, and why." />
      <div className="resources">
        {RESOURCES.map((r) => (
          <article key={r.name} className={`rcard tone-${r.tone}`}>
            <div className="rcard-top">
              <span className="rcard-ico"><Icon name={r.icon} size={26} strokeWidth={2} /></span>
              <div className="rcard-id">
                <h2 className="rcard-t">
                  {r.name}
                  {r.goat ? (
                    <span className="goat" title="Greatest of all time">
                      <Icon name="star" size={14} strokeWidth={2.4} /> GOAT
                    </span>
                  ) : null}
                </h2>
                <span className="rcard-by">{r.by}</span>
              </div>
            </div>
            <ul className="rcard-tags">
              {r.tags.map((t) => <li key={t}>{t}</li>)}
            </ul>
            <p className="rcard-what">{r.what}</p>
            <figure className="rcard-take">
              <figcaption>My take</figcaption>
              <blockquote>{r.take}</blockquote>
            </figure>
            <a className="btn rcard-go" href={r.url} target="_blank" rel="noreferrer">
              {r.cta}
              <Icon name="external" size={16} strokeWidth={2.2} />
            </a>
          </article>
        ))}
        <p className="resources-note">
          Not affiliated with Khan Academy or James Lu. Both links go to free content.
        </p>
      </div>
    </>
  )
}

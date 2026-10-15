import { Icon } from '../Icon'
import { fmt, plural, SECTION_ICON, SECTION_NAME } from '../../lib/labels'
import { graded } from '../../lib/score'
import type { DomainTally, Tally } from '../../lib/taxonomy'
import type { Section } from '../../types'
import { DomainCard, type TopicPicks } from './DomainCard'

/** One section's panel on Home: its header and tallies, then its domains. */
export function SectionPanel({ sec, tally, domains, picks }: {
  sec: Section
  tally: Tally
  /** This section's domains, in the official order. */
  domains: DomainTally[]
  picks: TopicPicks
}) {
  const g = graded(tally.seen, tally.correct)
  return (
    <section className={`spanel sec-${sec}`} aria-labelledby={`spanel-${sec}`}>
      <header className="spanel-h">
        <span className="spanel-ico"><Icon name={SECTION_ICON[sec]} size={24} strokeWidth={2} /></span>
        <div className="spanel-txt">
          <h3 className="spanel-t" id={`spanel-${sec}`}>{SECTION_NAME[sec]}</h3>
          <p className="spanel-sub">
            <span>{plural(tally.n, 'question')}</span> · <span>{fmt(tally.seen)} answered</span>
          </p>
        </div>
        {g ? <span className="spanel-pct">{g.pct}<small>% correct</small></span> : null}
      </header>
      <div className="dgrid">
        {domains.map((d) => <DomainCard key={d.code} d={d} picks={picks} />)}
      </div>
    </section>
  )
}

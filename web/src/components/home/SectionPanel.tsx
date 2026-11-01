import { Icon } from '../Icon'
import { fmt, plural, progressPct, SECTION_ICON, SECTION_NAME } from '../../lib/labels'
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
  const covered = progressPct(tally.seen, tally.n)
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
        <span className="spanel-pct" title="Share of this section answered">
          {covered}<small>%</small><span className="sr-only"> covered</span>
        </span>
      </header>
      <div className="dstack">
        {domains.map((d) => <DomainCard key={d.code} d={d} picks={picks} />)}
      </div>
    </section>
  )
}

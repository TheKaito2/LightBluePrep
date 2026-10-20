import { Icon } from '../Icon'
import { fmt, progressPct, srTally } from '../../lib/labels'
import type { ProcessTypes } from '../../lib/similar'
import type { DomainTally } from '../../lib/taxonomy'
import { SkillTypes } from './SkillTypes'

/** What the topic picker shows as ticked and how it reports a tick. Home owns the maths. */
export interface TopicPicks {
  ticked: Set<string>
  /** The picked process types, "skill.key". */
  types: string[] | undefined
  pt: ProcessTypes | null
  /** Questions per process type across the bank. */
  ptCounts: Map<string, number> | null
  /** Answered questions per process type, once worked out. */
  ptSeen: Map<string, number> | null
  /** Questions per skill and type under the difficulty and status filters, or null. */
  facetCounts: Map<string, number> | null
  /** The word after a filtered count ("87 hard"). */
  facetWord: string
  onDomain: (d: DomainTally) => void
  onSkill: (code: string) => void
  onType: (ref: string) => void
}

/** Progress pill: the share of the questions answered, or "new" before the first. */
export function Prog({ seen, n }: { seen: number; n: number }) {
  if (!seen) return <span className="acc none" aria-hidden="true">new</span>
  return <span className="acc prog" aria-hidden="true">{progressPct(seen, n)}%</span>
}

/** One domain: a checkbox for the whole of it, then a checkbox per skill. */
export function DomainCard({ d, picks }: { d: DomainTally; picks: TopicPicks }) {
  const { ticked, facetCounts, facetWord, onDomain, onSkill } = picks
  const on = d.skills.filter((s) => ticked.has(s.code)).length
  const state = on === 0 ? 'off' : on === d.skills.length ? 'on' : 'mixed'
  return (
    <article className={`dcard is-${state}`}>
      <button className="dcard-h" onClick={() => onDomain(d)}
              role="checkbox" aria-checked={state === 'mixed' ? 'mixed' : state === 'on'}>
        <span className={`box is-${state}`}><Icon name="check" size={12} strokeWidth={3} /></span>
        <span className="dcard-t">{d.name}</span>
        <span className="dcard-stat">
          {/* Compact on screen; spelled out for screen readers. */}
          <span aria-hidden="true">{fmt(d.seen)}/{fmt(d.n)}</span>
          <Prog seen={d.seen} n={d.n} />
          <span className="sr-only">{srTally(d.seen, d.n)}</span>
        </span>
      </button>
      <span className="dmeter" aria-hidden="true">
        <span style={{ transform: `scaleX(${d.n ? d.seen / d.n : 0})` }} />
      </span>
      <ul className="sklist">
        {d.skills.map((s) => {
          const sOn = ticked.has(s.code)
          const left = facetCounts ? facetCounts.get(s.code) ?? 0 : null
          return (
            <li key={s.code}>
              <button className={sOn ? 'skrow on' : 'skrow'} role="checkbox" aria-checked={sOn}
                      onClick={() => onSkill(s.code)}>
                <span className={`box sm is-${sOn ? 'on' : 'off'}`}>
                  <Icon name="check" size={10} strokeWidth={3.2} />
                </span>
                <span className="skrow-name">{s.name}</span>
                <span className="skrow-end">
                  {left !== null ? <span className="skrow-f">{fmt(left)} {facetWord}</span> : null}
                  {/* Compact on screen; spelled out for screen readers below. */}
                  <span className="skrow-n" aria-hidden="true">{fmt(s.seen)}/{fmt(s.n)}</span>
                  <Prog seen={s.seen} n={s.n} />
                </span>
                <span className="sr-only">{srTally(s.seen, s.n)}</span>
                <span className="skbar" aria-hidden="true">
                  <span style={{ transform: `scaleX(${s.n ? s.seen / s.n : 0})` }} />
                </span>
              </button>
              {sOn ? <SkillTypes skill={s} picks={picks} /> : null}
            </li>
          )
        })}
      </ul>
    </article>
  )
}

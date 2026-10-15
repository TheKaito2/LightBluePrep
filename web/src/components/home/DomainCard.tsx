import { Icon } from '../Icon'
import { fmt } from '../../lib/labels'
import { graded } from '../../lib/score'
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
  /** Questions per skill and type under the difficulty and status filters, or null. */
  facetCounts: Map<string, number> | null
  /** The word after a filtered count ("87 hard"). */
  facetWord: string
  onDomain: (d: DomainTally) => void
  onSkill: (code: string) => void
  onType: (ref: string) => void
}

/**
 * Graded accuracy, and only from enough answers to judge: one lucky question
 * is not "100%". Below that the row's count says all there is to say.
 */
function Acc({ seen, correct }: { seen: number; correct: number }) {
  const g = graded(seen, correct)
  if (!g) return null
  return <span className={`acc ${g.grade}`} title={`${fmt(correct)} of ${fmt(seen)} correct`}>{g.pct}%</span>
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
          {fmt(d.seen)} of {fmt(d.n)} answered
          <Acc seen={d.seen} correct={d.correct} />
        </span>
      </button>
      <span className="dmeter" aria-hidden="true">
        <span style={{ transform: `scaleX(${d.n ? d.seen / d.n : 0})` }} />
      </span>
      <ul className="sklist">
        {d.skills.map((s) => {
          const sOn = ticked.has(s.code)
          const g = graded(s.seen, s.correct)
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
                  <span className="skrow-n" aria-hidden="true">
                    {s.seen ? `${fmt(s.seen)}/${fmt(s.n)}` : fmt(s.n)}
                  </span>
                  <Acc seen={s.seen} correct={s.correct} />
                </span>
                <span className="sr-only">
                  {`, ${fmt(s.seen)} of ${fmt(s.n)} answered`}
                  {!s.seen ? ', not started' : g ? `, ${g.pct}% correct` : ''}
                </span>
                {s.seen ? (
                  <span className="skbar" aria-hidden="true">
                    <span style={{ transform: `scaleX(${s.seen / s.n})` }} />
                  </span>
                ) : null}
              </button>
              {sOn ? <SkillTypes skill={s} picks={picks} /> : null}
            </li>
          )
        })}
      </ul>
    </article>
  )
}

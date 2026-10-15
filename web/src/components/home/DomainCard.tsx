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
 * Accuracy pill. Graded colour only from enough answers to judge: one lucky
 * question is not "100%", so under that the figure stays grey. A skill with no
 * answers yet says "new".
 */
function Acc({ seen, correct, fresh = false }: { seen: number; correct: number; fresh?: boolean }) {
  if (!seen) return fresh ? <span className="acc none" aria-hidden="true">new</span> : null
  const g = graded(seen, correct)
  const pct = g ? g.pct : Math.round((correct / seen) * 100)
  return (
    <span className={`acc ${g ? g.grade : 'none'}`} aria-hidden="true"
          title={`${fmt(correct)} of ${fmt(seen)} correct${g ? '' : ', too few to grade yet'}`}>{pct}%</span>
  )
}

/** What the compact count and pill say, for screen readers. */
function srTally(seen: number, n: number, correct: number) {
  if (!seen) return `, 0 of ${fmt(n)} answered, not started`
  const g = graded(seen, correct)
  return `, ${fmt(seen)} of ${fmt(n)} answered${g ? `, ${g.pct}% correct` : ''}`
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
          <Acc seen={d.seen} correct={d.correct} />
          <span className="sr-only">{srTally(d.seen, d.n, d.correct)}</span>
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
                  <Acc seen={s.seen} correct={s.correct} fresh />
                </span>
                <span className="sr-only">{srTally(s.seen, s.n, s.correct)}</span>
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

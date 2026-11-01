import { useState } from 'react'
import { Icon } from '../Icon'
import { Modal } from '../Modal'
import { fmt, progressPct, srTally } from '../../lib/labels'
import type { ProcessTypes } from '../../lib/similar'
import type { DomainTally, SkillTally } from '../../lib/taxonomy'
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

/** One skill: the tile ticks it; the link under it narrows it to question types. */
function SkillTile({ s, picks, onTypes }: { s: SkillTally; picks: TopicPicks; onTypes: () => void }) {
  const { ticked, facetCounts, facetWord, pt, types, onSkill } = picks
  const on = ticked.has(s.code)
  const left = facetCounts ? facetCounts.get(s.code) ?? 0 : null
  const all = pt?.types[s.code]
  const total = all ? Object.keys(all).length : 0
  const picked = types?.filter((r) => r.startsWith(`${s.code}.`)).length ?? 0
  return (
    <li className={on ? 'sktile on' : 'sktile'}>
      <button className="sktile-main" role="checkbox" aria-checked={on} onClick={() => onSkill(s.code)}>
        <span className="sktile-t">{s.name}</span>
        <span className={`box round is-${on ? 'on' : 'off'}`}>
          <Icon name="check" size={13} strokeWidth={3.2} />
        </span>
        <span className="sktile-m" aria-hidden="true">
          {fmt(s.seen)} of {fmt(s.n)}
          {left !== null ? <span className="sktile-f"> · {fmt(left)} {facetWord}</span> : null}
        </span>
        <span className="sr-only">{srTally(s.seen, s.n)}{left !== null ? `, ${fmt(left)} ${facetWord}` : ''}</span>
        <span className="skbar" aria-hidden="true">
          <span style={{ transform: `scaleX(${s.n ? s.seen / s.n : 0})` }} />
        </span>
      </button>
      {total ? (
        <button className="sktile-types" onClick={onTypes}>
          <span><span className="sr-only">{s.name}: </span>{picked ? `${picked} of ${total} question types` : `${total} question types`}</span>
          <Icon name="chevron-right" size={14} strokeWidth={2.4} />
        </button>
      ) : null}
    </li>
  )
}

/** One domain: its name, a checkbox for the whole of it, then a tile per skill. */
export function DomainCard({ d, picks }: { d: DomainTally; picks: TopicPicks }) {
  const { ticked, onDomain, onSkill } = picks
  /** The skill whose question types are open. Here, not in the tile, whose pop animation would trap a fixed dialog. */
  const [typesOf, setTypesOf] = useState<SkillTally | null>(null)
  const on = d.skills.filter((s) => ticked.has(s.code)).length
  const state = on === 0 ? 'off' : on === d.skills.length ? 'on' : 'mixed'
  return (
    <section className="dgroup" aria-label={d.name}>
      <header className="dgroup-h">
        <h4 className="dgroup-t">{d.name}</h4>
        <span className="dgroup-n" aria-hidden="true">{fmt(d.seen)} of {fmt(d.n)}</span>
        <span className="sr-only">{srTally(d.seen, d.n)}</span>
        <button className="dgroup-all" onClick={() => onDomain(d)}
                role="checkbox" aria-checked={state === 'mixed' ? 'mixed' : state === 'on'}
                aria-label={`Select all of ${d.name}`}>
          <span className={`box is-${state}`}><Icon name="check" size={12} strokeWidth={3} /></span>
          Select all
        </button>
      </header>
      <ul className="sktiles">
        {d.skills.map((s) => (
          <SkillTile key={s.code} s={s} picks={picks}
                     onTypes={() => { if (!ticked.has(s.code)) onSkill(s.code); setTypesOf(s) }} />
        ))}
      </ul>
      {typesOf ? (
        <Modal title={typesOf.name} className="types-sheet" onClose={() => setTypesOf(null)}
               footer={<button type="button" className="btn primary" onClick={() => setTypesOf(null)}>Done</button>}>
          <SkillTypes skill={typesOf} picks={picks} />
        </Modal>
      ) : null}
    </section>
  )
}

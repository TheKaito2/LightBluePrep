import { Icon } from '../Icon'
import { fmt } from '../../lib/labels'
import type { SkillTally } from '../../lib/taxonomy'
import type { TopicPicks } from './DomainCard'

/**
 * The process types under a ticked skill, each a checkbox that narrows the
 * skill to that kind of question. Shown only when the skill is ticked and the
 * process-type file has types for it.
 */
export function SkillTypes({ skill, picks }: { skill: SkillTally; picks: TopicPicks }) {
  const { pt, types: pickedTypes, facetCounts, facetWord, ptCounts, onType } = picks
  const all = pt?.types[skill.code]
  if (!all) return null
  const types = Object.entries(all)
  const picked = types.filter(([key]) => pickedTypes?.includes(`${skill.code}.${key}`)).length
  return (
    <div className="sktypes">
      <span className="sktypes-cap">
        {picked ? `${picked} of ${types.length} types` : 'All question types · pick to narrow'}
      </span>
      <ul className="sktypes-list" aria-label={`${skill.name}: question types`}>
        {types.map(([key, t]) => {
          const ref = `${skill.code}.${key}`
          const tOn = pickedTypes?.includes(ref) ?? false
          return (
            <li key={key}>
              <button className={tOn ? 'sktype on' : 'sktype'} role="checkbox" aria-checked={tOn}
                      aria-describedby={`how-${ref}`}
                      onClick={() => onType(ref)}>
                <span className={`box xs is-${tOn ? 'on' : 'off'}`}>
                  <Icon name="check" size={9} strokeWidth={3.4} />
                </span>
                <span className="sktype-name">{t.label}</span>
                <span className="sktype-n">
                  {facetCounts
                    ? `${fmt(facetCounts.get(ref) ?? 0)} ${facetWord}`
                    : ptCounts?.get(ref) ?? 0}
                </span>
                {/* Shown on the picked or focused type; always the description. */}
                <span className="sktype-how" id={`how-${ref}`} aria-hidden="true">{t.how}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

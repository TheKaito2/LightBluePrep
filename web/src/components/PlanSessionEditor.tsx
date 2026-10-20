/**
 * Add or change one plan session: its day, what it practises and how many
 * questions. A session is one of three kinds: chosen skills, a timed mix of a
 * section, or a review of missed and marked questions.
 */
import { useId, useState } from 'react'
import { Modal } from './Modal'
import { Segmented } from './Segmented'
import { SECTION_NAME } from '../lib/labels'
import { dayKey } from '../lib/progress'
import type { PlanSession } from '../lib/plan'
import type { DomainTally } from '../lib/taxonomy'
import type { Filters, Section } from '../types'

type Kind = 'skills' | 'mixed' | 'review'
const SIZES = [5, 10, 15, 20, 25, 30, 40]

const kindOf = (s: PlanSession | null): Kind =>
  !s ? 'skills' : s.phase === 'review' ? 'review' : s.phase === 'mixed' ? 'mixed' : 'skills'

/** "Algebra", "Algebra and Circles", "Algebra and 2 more". */
function skillsTitle(codes: string[], names: Map<string, string>): string {
  const n = codes.map((c) => names.get(c) ?? c)
  if (n.length <= 2) return n.join(' and ')
  return `${n[0]} and ${n.length - 1} more`
}

export function PlanSessionEditor({ session, defaultDate, lastDate, domains, onSave, onClose }: {
  /** Null to add a new one. */
  session: PlanSession | null
  defaultDate: string
  /** The last day a session may go on (the day before the test's eve). */
  lastDate: string
  domains: readonly DomainTally[]
  onSave: (s: PlanSession) => void
  onClose: () => void
}) {
  const ids = useId()
  const today = dayKey(new Date())
  const [date, setDate] = useState(session?.date ?? defaultDate)
  const [kind, setKind] = useState<Kind>(kindOf(session))
  const [skills, setSkills] = useState<string[]>(session?.filters.skills ?? [])
  const [section, setSection] = useState<Section>(session?.filters.section ?? 'MATH')
  const [size, setSize] = useState(session?.filters.size ?? 15)
  const [error, setError] = useState<string | null>(null)

  const names = new Map(domains.flatMap((d) => d.skills.map((k) => [k.code, k.name] as const)))

  function save() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError('Pick a day.'); return }
    if (kind === 'skills' && !skills.length) { setError('Pick at least one skill.'); return }
    // Skill codes repeat across sections, so a one-section pick names its section.
    const secs = new Set(skills.map((c) => domains.find((d) => d.skills.some((k) => k.code === c))?.section))
    const only = secs.size === 1 ? [...secs][0] : undefined
    const filters: Filters = kind === 'skills' ? { skills, size, ...(only ? { section: only } : {}) }
      : kind === 'mixed' ? { section, size, speed: 1 } : { statuses: ['wrong', 'flagged'], size }
    const title = kind === 'skills' ? skillsTitle(skills, names)
      : kind === 'mixed' ? `Timed mix: ${SECTION_NAME[section]}` : 'Review your misses'
    onSave({
      // Skipped, done and the linked set carry over; only what was edited changes.
      ...session,
      id: session?.id ?? crypto.randomUUID(),
      date,
      phase: kind === 'skills' ? 'build' : kind,
      title,
      filters,
    })
    onClose()
  }

  return (
    <Modal title={session ? 'Edit session' : 'Add a session'} onClose={onClose} className="plan-editor"
           footer={<button type="button" className="btn primary" onClick={save}>Save session</button>}>
      <div className="wiz-field">
        <label className="fb-label" htmlFor={`${ids}date`}>Day</label>
        <input id={`${ids}date`} type="date" className="goal-input" min={today} max={lastDate} value={date}
               onChange={(e) => { setDate(e.target.value); setError(null) }} />
      </div>
      <Segmented legend="Practise" value={kind} onChange={setKind}
                 options={[
                   { value: 'skills', label: 'Skills' },
                   { value: 'mixed', label: 'Timed mix' },
                   { value: 'review', label: 'Review misses' },
                 ]} />
      {kind === 'skills' ? (
        <fieldset className="wiz-field plan-skills">
          <legend className="sr-only">Skills</legend>
          {domains.map((d) => (
            <div key={`${d.section}${d.code}`} className={`plan-skill-group sec-${d.section}`}>
              <p className="plan-skill-d">{d.name}</p>
              <div className="wiz-chips">
                {d.skills.map((k) => {
                  const on = skills.includes(k.code)
                  return (
                    <button key={k.code} type="button" aria-pressed={on} className={on ? 'chip on' : 'chip'}
                            onClick={() => { setSkills(on ? skills.filter((c) => c !== k.code) : [...skills, k.code]); setError(null) }}>
                      {k.name}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </fieldset>
      ) : null}
      {kind === 'mixed' ? (
        <Segmented legend="Section" value={section} onChange={setSection}
                   options={[{ value: 'RW', label: SECTION_NAME.RW }, { value: 'MATH', label: SECTION_NAME.MATH }]}
                   hint="Timed at the real test's pace." />
      ) : null}
      {kind === 'review' ? (
        <p className="fb-note">Questions you got wrong or marked for review. With none yet, new questions instead.</p>
      ) : null}
      <div className="wiz-field">
        <label className="fb-label" htmlFor={`${ids}size`}>Questions</label>
        <select id={`${ids}size`} className="sel goal-input" value={size} onChange={(e) => setSize(Number(e.target.value))}>
          {SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      {error ? <p className="fb-err" role="alert">{error}</p> : null}
    </Modal>
  )
}

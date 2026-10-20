/**
 * Make a plan: a few questions, a preview, and Save.
 *
 * "auto" asks five things and builds the sessions (lib/plan.ts buildPlan).
 * "manual" asks only what a hand-built plan needs (test date, target, days)
 * and starts it empty; sessions are then added one by one on the Plan page.
 * Saving also writes the test date and target into the goal, so the score
 * card and the plan always count down to the same day.
 */
import { useId, useMemo, useState } from 'react'
import { Modal } from './Modal'
import { Segmented } from './Segmented'
import { TARGETS, daysUntil, shortDate, type Goal } from '../lib/goal'
import {
  MINUTES, PHASE_NAME, SAT_DATES, blankPlan, buildPlan, phaseCounts, questionsFor, sessionDates,
  type Focus, type Plan, type PlanAnswers,
} from '../lib/plan'
import { dayKey } from '../lib/progress'
import { saveStudy } from '../lib/study'
import { toUserMessage } from '../lib/errors'
import type { DomainTally, SkillTally } from '../lib/taxonomy'

const WEEKDAYS = [
  { n: 1, short: 'Mon' }, { n: 2, short: 'Tue' }, { n: 3, short: 'Wed' }, { n: 4, short: 'Thu' },
  { n: 5, short: 'Fri' }, { n: 6, short: 'Sat' }, { n: 0, short: 'Sun' },
]

/** A test more than this far out is not planned day by day (and keeps the plan a sane size). */
const MAX_DAYS = 400

type Step = 'date' | 'target' | 'days' | 'start' | 'focus' | 'preview'
const AUTO: Step[] = ['date', 'target', 'days', 'start', 'focus', 'preview']
const MANUAL: Step[] = ['date', 'target', 'days']

export function PlanWizard({ mode, goal, skills, domains, estimate, onClose, onSaved }: {
  mode: 'auto' | 'manual'
  goal: Goal | null
  skills: readonly SkillTally[]
  domains: readonly DomainTally[]
  /** The unlocked score estimate, or null. */
  estimate: { rw: number; math: number } | null
  onClose: () => void
  onSaved?: (plan: Plan) => void
}) {
  const ids = useId()
  const today = dayKey(new Date())
  const maxDate = dayKey(new Date(Date.now() + MAX_DAYS * 86_400_000))
  const steps = mode === 'auto' ? AUTO : MANUAL
  const [at, setAt] = useState(0)
  const step = steps[at]!

  const upcoming = SAT_DATES.filter((d) => daysUntil(d.date) >= 2)
  const [date, setDate] = useState(goal?.date && daysUntil(goal.date) >= 2 ? goal.date : upcoming[0]?.date ?? '')
  const [target, setTarget] = useState(goal?.target ? String(goal.target) : '')
  const [days, setDays] = useState<number[]>([1, 3, 5])
  const [minutes, setMinutes] = useState<number>(30)
  const [startFrom, setStartFrom] = useState<PlanAnswers['start_from']>(estimate ? 'estimate' : 'score_check')
  const [known, setKnown] = useState({ rw: '', math: '' })
  const [focus, setFocus] = useState<'auto' | 'RW' | 'MATH' | 'pick'>('auto')
  const [picked, setPicked] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const answers = (): PlanAnswers => ({
    test_date: date,
    target: target ? Number(target) : null,
    days,
    minutes,
    start_from: startFrom,
    ...(startFrom === 'known' ? { known: { rw: Number(known.rw), math: Number(known.math) } } : {}),
    focus: (focus === 'pick' ? picked : focus) as Focus,
  })

  const preview = useMemo(
    () => (step === 'preview' ? buildPlan(answers(), { today, skills, estimate }) : null),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- rebuilt when the preview step opens
    [step])

  /** What is wrong with this step's answer, or null. */
  function problem(): string | null {
    if (step === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Pick your test date.'
      if (daysUntil(date) < 2) return 'Pick a date at least two days away.'
      if (daysUntil(date) > MAX_DAYS) return 'Pick a date within the next year.'
    }
    if (step === 'days' && !days.length) return 'Pick at least one day.'
    if (step === 'days' && daysUntil(date) > MAX_DAYS) return 'Pick a test date within the next year.'
    if (step === 'days' && !sessionDates(today, date, days).length) return 'None of those days fall before your test.'
    if (step === 'start' && startFrom === 'known') {
      const ok = (v: string) => /^\d+$/.test(v) && Number(v) >= 200 && Number(v) <= 800
      if (!ok(known.rw) || !ok(known.math)) return 'Enter both section scores, 200 to 800.'
    }
    if (step === 'focus' && focus === 'pick' && !picked.length) return 'Pick at least one area.'
    return null
  }

  async function save() {
    setBusy(true)
    try {
      const plan = mode === 'auto' && preview ? preview : blankPlan(answers())
      await saveStudy({
        plan,
        goal: { date: plan.test_date, target: plan.target, daily: goal?.daily ?? null, updated_at: Date.now() },
      })
      onSaved?.(plan)
      onClose()
    } catch (e) {
      setError(toUserMessage(e)); setBusy(false)
    }
  }

  function next() {
    const p = problem()
    if (p) { setError(p); return }
    setError(null)
    if (at === steps.length - 1) void save()
    else setAt(at + 1)
  }

  const last = at === steps.length - 1
  const counts = preview ? phaseCounts(preview.sessions.length,
    preview.sessions.some((s) => s.phase === 'baseline')) : null

  return (
    <Modal title={mode === 'auto' ? 'Make my plan' : 'Build my own plan'} onClose={onClose} className="plan-wizard"
           footer={(
             <>
               {at > 0 ? <button type="button" className="btn" disabled={busy} onClick={() => { setError(null); setAt(at - 1) }}>Back</button> : null}
               <button type="button" className="btn primary" disabled={busy} onClick={next}>
                 {last ? 'Save plan' : 'Next'}
               </button>
             </>
           )}>
      <p className="wiz-step" aria-live="polite">Step {at + 1} of {steps.length}</p>

      {step === 'date' ? (
        <fieldset className="wiz-field">
          <legend className="fb-label">When is your test?</legend>
          <div className="wiz-chips">
            {upcoming.slice(0, 6).map((d) => (
              <button key={d.date} type="button" aria-pressed={date === d.date}
                      className={date === d.date ? 'chip on' : 'chip'} onClick={() => { setDate(d.date); setError(null) }}>
                {shortDate(d.date)} {d.date.slice(0, 4)}{d.expected ? ' (expected)' : ''}
              </button>
            ))}
          </div>
          <label className="fb-note" htmlFor={`${ids}date`}>Another date (a school day test, for example)</label>
          <input id={`${ids}date`} type="date" className="goal-input" min={today} max={maxDate} value={date}
                 onChange={(e) => { setDate(e.target.value); setError(null) }} />
          <p className="fb-note">College Board weekend dates. Check your registration for the exact one.</p>
        </fieldset>
      ) : null}

      {step === 'target' ? (
        <div className="wiz-field">
          <label className="fb-label" htmlFor={`${ids}target`}>What score are you aiming for?</label>
          <select id={`${ids}target`} className="sel goal-input" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">No target</option>
            {TARGETS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <p className="fb-note">The plan leans toward the section furthest from half of it.</p>
        </div>
      ) : null}

      {step === 'days' ? (
        <>
          <fieldset className="wiz-field">
            <legend className="fb-label">Which days can you practise?</legend>
            <div className="wiz-chips wiz-days">
              {WEEKDAYS.map((d) => {
                const on = days.includes(d.n)
                return (
                  <button key={d.n} type="button" aria-pressed={on} className={on ? 'chip on' : 'chip'}
                          onClick={() => { setDays(on ? days.filter((x) => x !== d.n) : [...days, d.n]); setError(null) }}>
                    {d.short}
                  </button>
                )
              })}
            </div>
          </fieldset>
          <Segmented legend="How long each time?" value={minutes} onChange={setMinutes}
                     options={MINUTES.map((m) => ({ value: m, label: `${m} min` }))}
                     hint={`About ${questionsFor(minutes)} questions a session, with time to read the explanations.`} />
          {date ? (
            <p className="fb-note">{sessionDates(today, date, days).length} sessions before {shortDate(date)}.</p>
          ) : null}
        </>
      ) : null}

      {step === 'start' ? (
        <>
          <Segmented legend="Where are you starting from?" value={startFrom} onChange={setStartFrom}
                     options={[
                       ...(estimate ? [{ value: 'estimate' as const, label: `My estimate (${estimate.rw + estimate.math})` }] : []),
                       { value: 'score_check' as const, label: 'Take a score check' },
                       { value: 'known' as const, label: 'I know my scores' },
                     ]}
                     hint={startFrom === 'score_check'
                       ? 'The first session is 20 questions, 10 per section, to measure where you are.'
                       : startFrom === 'estimate' ? 'From your first tries on this site.' : 'From a practice test or a past SAT.'} />
          {startFrom === 'known' ? (
            <div className="wiz-known">
              <label className="fb-label" htmlFor={`${ids}rw`}>Reading and Writing</label>
              <input id={`${ids}rw`} className="goal-input" inputMode="numeric" placeholder="200 to 800"
                     value={known.rw} onChange={(e) => setKnown({ ...known, rw: e.target.value.trim() })} />
              <label className="fb-label" htmlFor={`${ids}math`}>Math</label>
              <input id={`${ids}math`} className="goal-input" inputMode="numeric" placeholder="200 to 800"
                     value={known.math} onChange={(e) => setKnown({ ...known, math: e.target.value.trim() })} />
            </div>
          ) : null}
        </>
      ) : null}

      {step === 'focus' ? (
        <>
          <Segmented legend="What should it cover?" value={focus} onChange={setFocus}
                     options={[
                       { value: 'auto', label: 'Decide for me' },
                       { value: 'RW', label: 'R&W only' },
                       { value: 'MATH', label: 'Math only' },
                       { value: 'pick', label: 'Pick areas' },
                     ]}
                     hint={focus === 'auto' ? 'Both sections, weighted to your weak skills and to what the test asks most.' : undefined} />
          {focus === 'pick' ? (
            <fieldset className="wiz-field">
              <legend className="sr-only">Areas</legend>
              <div className="wiz-chips">
                {domains.map((d) => {
                  const on = picked.includes(d.code)
                  return (
                    <button key={`${d.section}${d.code}`} type="button" aria-pressed={on}
                            className={`chip sec-${d.section}${on ? ' on' : ''}`}
                            onClick={() => { setPicked(on ? picked.filter((x) => x !== d.code) : [...picked, d.code]); setError(null) }}>
                      {d.name}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          ) : null}
        </>
      ) : null}

      {step === 'preview' && preview && counts ? (
        <div className="wiz-preview">
          <p className="fb-p">
            {preview.sessions.length} sessions of about {questionsFor(minutes)} questions, to {shortDate(date)}.
          </p>
          <ul className="wiz-phases">
            {(Object.keys(counts) as (keyof typeof counts)[]).filter((k) => counts[k]).map((k) => (
              <li key={k}><strong>{counts[k]}</strong> {PHASE_NAME[k]}</li>
            ))}
          </ul>
          <p className="fb-label">First sessions</p>
          <ol className="wiz-first">
            {preview.sessions.slice(0, 5).map((s) => (
              <li key={s.id}><span>{shortDate(s.date)}</span> {s.title}</li>
            ))}
          </ol>
          <p className="fb-note">You can edit, move or skip any session afterwards.</p>
        </div>
      ) : null}

      {error ? <p className="fb-err" role="alert">{error}</p> : null}
    </Modal>
  )
}

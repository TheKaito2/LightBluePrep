/**
 * Make a plan: a few questions, a preview, and Save.
 *
 * "auto" asks five things and builds the sessions (lib/plan.ts buildPlan).
 * "manual" asks only what a hand-built plan needs (test date, target, days)
 * and starts it empty; sessions are then added one by one on the Plan page.
 * Saving also writes the test date and target into the goal, so the score
 * card and the plan always count down to the same day.
 */
import { useEffect, useId, useMemo, useState } from 'react'
import * as api from '../api'
import { BulbSays } from './Mascot'
import { Modal } from './Modal'
import { Segmented } from './Segmented'
import { TARGETS, daysUntil, shortDate, type Goal } from '../lib/goal'
import {
  MINUTES, PHASE_NAME, SAT_DATES, WEIGHT_PRESETS, blankPlan, buildPlan, coverPlan, dayQuotas, daysFrom,
  phaseCounts, questionsFor, sessionDates, typeSlots, type Focus, type Plan, type PlanAnswers, type TypeSlot,
} from '../lib/plan'
import { loadProcessTypes } from '../lib/similar'
import { dayKey } from '../lib/progress'
import { saveStudy } from '../lib/study'
import { toUserMessage } from '../lib/errors'
import type { DomainTally, SkillTally } from '../lib/taxonomy'

const WEEKDAYS = [
  { n: 1, short: 'Mon' }, { n: 2, short: 'Tue' }, { n: 3, short: 'Wed' }, { n: 4, short: 'Thu' },
  { n: 5, short: 'Fri' }, { n: 6, short: 'Sat' }, { n: 0, short: 'Sun' },
]

/** What Bulb says on each step; the question itself stays with its field. */
const BULB_LINE: Record<string, string> = {
  what: "Let's set this up. It takes a minute.",
  date: 'First, the big day.',
  target: 'Aim high. You can change it later.',
  days: 'Be honest about your week.',
  start: 'So I know where to begin.',
  focus: 'Almost done.',
  preview: "Here's your plan.",
}

/** A test more than this far out is not planned day by day (and keeps the plan a sane size). */
const MAX_DAYS = 400

type Step = 'what' | 'date' | 'target' | 'days' | 'start' | 'focus' | 'preview'
const COVER: Step[] = ['what', 'date', 'target', 'days', 'preview']
const SKILLS: Step[] = ['what', 'date', 'target', 'days', 'start', 'focus', 'preview']
const MANUAL: Step[] = ['date', 'target', 'days']
const WEIGHTS = [{ value: 0, label: 'Off' }, { value: 0.5, label: '½' }, { value: 1, label: '1×' }, { value: 2, label: '2×' }]

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
  const [goalMode, setGoalMode] = useState<'cover' | 'skills'>('cover')
  const steps = mode === 'manual' ? MANUAL : goalMode === 'cover' ? COVER : SKILLS
  const [at, setAt] = useState(0)
  const step = steps[at]!

  const upcoming = SAT_DATES.filter((d) => daysUntil(d.date) >= 2)
  const [date, setDate] = useState(goal?.date && daysUntil(goal.date) >= 2 ? goal.date : upcoming[0]?.date ?? '')
  const [target, setTarget] = useState(goal?.target ? String(goal.target) : '')
  const [weights, setWeights] = useState<number[]>(WEIGHT_PRESETS[0]!.weights)
  const days = daysFrom(weights)
  // What clearing the bank has to cover: every type, and its unanswered count.
  const [bank, setBank] = useState<{ slots: TypeSlot[]; unseen: Map<string, number>; total: number } | null>(null)
  useEffect(() => {
    if (mode !== 'auto') return
    let stale = false
    Promise.all([loadProcessTypes(), api.questionsById()]).then(([pt, byId]) => {
      if (stale || !pt) return
      const unseen = new Map<string, number>()
      for (const q of byId.values()) {
        const ref = !q.answered_at && q.cb_id ? pt.q[q.cb_id] : undefined
        if (ref) unseen.set(ref, (unseen.get(ref) ?? 0) + 1)
      }
      setBank({ slots: typeSlots(skills, pt.types), unseen, total: [...unseen.values()].reduce((a, b) => a + b, 0) })
    }).catch(() => {})
    return () => { stale = true }
  }, [mode, skills])
  const [minutes, setMinutes] = useState<number>(30)
  const [startFrom, setStartFrom] = useState<PlanAnswers['start_from']>(estimate ? 'estimate' : 'score_check')
  const [known, setKnown] = useState({ rw: '', math: '' })
  const [focus, setFocus] = useState<'auto' | 'RW' | 'MATH' | 'pick'>('auto')
  const [picked, setPicked] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const answers = (): PlanAnswers => ({
    mode: mode === 'manual' ? 'skills' : goalMode,
    weights,
    test_date: date,
    target: target ? Number(target) : null,
    days,
    minutes,
    start_from: startFrom,
    ...(startFrom === 'known' ? { known: { rw: Number(known.rw), math: Number(known.math) } } : {}),
    focus: (focus === 'pick' ? picked : focus) as Focus,
  })

  const preview = useMemo(
    () => (step !== 'preview' ? null : goalMode === 'cover' && bank
      ? coverPlan(answers(), { today, types: bank.slots, unseen: bank.unseen })
      : buildPlan(answers(), { today, skills, estimate })),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- rebuilt when the preview step opens
    [step])

  /** What is wrong with this step's answer, or null. */
  function problem(): string | null {
    if (step === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Pick your test date.'
      if (daysUntil(date) < 2) return 'Pick a date at least two days away.'
      if (daysUntil(date) > MAX_DAYS) return 'Pick a date within the next year.'
    }
    if (step === 'what' && goalMode === 'cover' && !bank) return 'Still counting the questions. Try again in a moment.'
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
  // A week of quotas from today, to show what a normal, heavy and light day hold.
  const dates = date && days.length ? sessionDates(today, date, days) : []
  const quotas = goalMode === 'cover' && bank ? dayQuotas(dates, weights, bank.total) : []
  const perDay = (dow: number) => {
    const i = dates.findIndex((d) => new Date(`${d}T00:00:00`).getDay() === dow)
    return i < 0 ? null : quotas[i]
  }
  const counts = preview && goalMode === 'skills' ? phaseCounts(preview.sessions.length,
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
      <p className="sr-only" aria-live="polite">Step {at + 1} of {steps.length}</p>
      <span className="wiz-prog" aria-hidden="true"><span style={{ width: `${((at + 1) / steps.length) * 100}%` }} /></span>
      <BulbSays size={48} mood={step === 'preview' ? 'cheer' : 'neutral'}>{BULB_LINE[step]}</BulbSays>

      {step === 'what' ? (
        <Segmented legend="What should the plan do?" value={goalMode} onChange={setGoalMode}
                   options={[
                     { value: 'cover', label: 'Clear every question' },
                     { value: 'skills', label: 'Practice my weak skills' },
                   ]}
                   hint={goalMode === 'cover'
                     ? `Every question you have not answered${bank ? ` (${bank.total.toLocaleString()})` : ''}, type by type, spread over your days.`
                     : 'Sessions weighted to your weak skills, then timed mixes and a final review.'} />
      ) : null}

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
            <legend className="fb-label">How much on each day?</legend>
            <div className="wiz-chips">
              {WEIGHT_PRESETS.map((p) => {
                const on = p.weights.join() === weights.join()
                return (
                  <button key={p.key} type="button" aria-pressed={on} className={on ? 'chip on' : 'chip'}
                          onClick={() => { setWeights(p.weights); setError(null) }}>{p.label}</button>
                )
              })}
            </div>
            <div className="wiz-week">
              {WEEKDAYS.map((d) => (
                <label key={d.n} className={weights[d.n] ? 'wiz-day' : 'wiz-day is-off'}>
                  <span className="wiz-day-n">{d.short}</span>
                  <select className="sel" value={weights[d.n]}
                          onChange={(e) => { setWeights(weights.map((w, i) => (i === d.n ? Number(e.target.value) : w))); setError(null) }}>
                    {WEIGHTS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
                  </select>
                  {goalMode === 'cover' && mode === 'auto' ? (
                    <span className="wiz-day-q">{perDay(d.n) ?? 0}</span>
                  ) : null}
                </label>
              ))}
            </div>
          </fieldset>
          {goalMode === 'skills' && mode === 'auto' ? (
            <Segmented legend="How long on a normal day?" value={minutes} onChange={setMinutes}
                       options={MINUTES.map((m) => ({ value: m, label: `${m} min` }))}
                       hint={`About ${questionsFor(minutes)} questions on a 1× day; a 2× day doubles it.`} />
          ) : null}
          {date ? (
            <p className="fb-note">
              {dates.length} practice days before {shortDate(date)}
              {goalMode === 'cover' && mode === 'auto' && bank ? ` for ${bank.total.toLocaleString()} questions. The numbers are the first week's.` : '.'}
            </p>
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

      {step === 'preview' && preview ? (
        <div className="wiz-preview">
          {counts ? (
            <>
              <p className="fb-p">{preview.sessions.length} sessions to {shortDate(date)}.</p>
              <ul className="wiz-phases">
                {(Object.keys(counts) as (keyof typeof counts)[]).filter((k) => counts[k]).map((k) => (
                  <li key={k}><strong>{counts[k]}</strong> {PHASE_NAME[k]}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="fb-p">
              {preview.sessions.reduce((a, x) => a + (x.filters.size ?? 0), 0).toLocaleString()} questions
              in {preview.sessions.length} days to {shortDate(date)}, every process type in turn.
            </p>
          )}
          <p className="fb-label">First days</p>
          <ol className="wiz-first">
            {preview.sessions.slice(0, 5).map((x) => (
              <li key={x.id}><span>{shortDate(x.date)}</span> {x.title} ({x.filters.size})</li>
            ))}
          </ol>
          <p className="fb-note">You can edit, move or skip any day afterwards, and pick types for a day on the Practice page.</p>
        </div>
      ) : null}

      {error ? <p className="fb-err" role="alert">{error}</p> : null}
    </Modal>
  )
}

/**
 * The Plan page (#plan): every session from today to the test, grouped by
 * week, with what to do next at the top.
 *
 * The plan lives in the study row (lib/study.ts) with the goal, so it syncs
 * when signed in. A session is ticked off when the practice set it started is
 * finished (closeFinishedSessions), or by hand.
 */
import { useEffect, useMemo, useState } from 'react'
import { EmptyState } from './EmptyState'
import { Icon } from './Icon'
import { Mascot } from './Mascot'
import { Modal } from './Modal'
import { PageHead } from './PageHead'
import { PlanSessionEditor } from './PlanSessionEditor'
import { PlanWizard } from './PlanWizard'
import { countdown, shortDate } from '../lib/goal'
import { PLAN_FILE, planBlob } from '../lib/ics'
import { fmt, plural } from '../lib/labels'
import {
  PHASE_NAME, missed, nextSession, patchSession, planProgress, putSession, questionsFor, reflow,
  removeSession, togglePart, weekOf, type PlanSession,
} from '../lib/plan'
import { dayKey, score, type HistoryRow } from '../lib/progress'
import { saveBlob } from '../lib/share'
import { closeFinishedSessions, savePlan, useStudy } from '../lib/study'
import { rollup } from '../lib/taxonomy'
import { useToast } from '../lib/toast'
import type { TaxonomyRow } from '../types'

/** "Wed, Oct 21". */
const dayLabel = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

export function Plan({ taxonomy, history, onStartSession, onPickTopics }: {
  taxonomy: TaxonomyRow[]
  history: HistoryRow[]
  /** Start a day, or one of its types when `ref` names it. */
  onStartSession: (s: PlanSession, ref?: string) => void
  /** Pick a session's topics and types on the Home picker (null: a new session). */
  onPickTopics: (s: PlanSession | null, date: string) => void
}) {
  const { goal, plan, loaded } = useStudy()
  const toast = useToast()
  const today = dayKey(new Date())
  const [wizard, setWizard] = useState<'auto' | 'manual' | null>(null)
  const [editing, setEditing] = useState<PlanSession | 'new' | null>(null)
  const [calendar, setCalendar] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmReplace, setConfirmReplace] = useState(false)

  useEffect(() => { void closeFinishedSessions().catch(() => {}) }, [])

  const roll = useMemo(() => rollup(taxonomy), [taxonomy])
  const estimate = useMemo(() => {
    const s = score(history)
    return s.rw !== null && s.math !== null ? { rw: s.rw, math: s.math } : null
  }, [history])

  const save = (next: typeof plan) => { void savePlan(next).catch(() => toast('Could not save the plan. Try again.')) }
  /** Tick one process type off a day (or back on). */
  const tickType = (sessionId: string, ref: string) => { if (plan) save(togglePart(plan, sessionId, ref)) }

  const dialogs = (
    <>
      {wizard ? (
        <PlanWizard mode={wizard} goal={goal} skills={roll.skills} domains={roll.domains} estimate={estimate}
                    onClose={() => setWizard(null)} />
      ) : null}
      {editing && plan ? (
        <PlanSessionEditor session={editing === 'new' ? null : editing}
                           defaultDate={nextSession(plan, today)?.session.date ?? today}
                           lastDate={lastDay(plan.test_date)} domains={roll.domains}
                           onSave={(s) => save(putSession(plan, s))} onClose={() => setEditing(null)}
                           onPickTopics={(date) => onPickTopics(editing === 'new' ? null : editing, date)} />
      ) : null}
      {calendar && plan ? <CalendarDialog sessions={plan.sessions} minutes={plan.minutes} onClose={() => setCalendar(false)} /> : null}
      {confirmReplace ? (
        <Modal title="Replace your plan?" onClose={() => setConfirmReplace(false)}
               footer={(
                 <>
                   <button type="button" className="btn" autoFocus onClick={() => setConfirmReplace(false)}>Cancel</button>
                   <button type="button" className="btn primary"
                           onClick={() => { setConfirmReplace(false); setWizard('auto') }}>Make a new plan</button>
                 </>
               )}>
          <p className="fb-p">The new plan replaces every session in this one, done and skipped ones too. Your answers and sets stay.</p>
        </Modal>
      ) : null}
      {confirmDelete ? (
        <Modal title="Delete your plan?" onClose={() => setConfirmDelete(false)}
               footer={(
                 <>
                   <button type="button" className="btn" autoFocus onClick={() => setConfirmDelete(false)}>Cancel</button>
                   <button type="button" className="btn danger"
                           onClick={() => { save(null); setConfirmDelete(false) }}>Delete plan</button>
                 </>
               )}>
          <p className="fb-p">Every session goes. Your answers, sets and goal stay.</p>
        </Modal>
      ) : null}
    </>
  )

  if (!loaded) return <PageHead tone="blue" eyebrow="Study plan" title="Plan" sub="What to practice and when, up to your test." />

  if (!plan) {
    return (
      <>
        <PageHead tone="blue" eyebrow="Study plan" title="Plan" sub="What to practice and when, up to your test." />
        <div className="plan">
          <EmptyState title="No plan yet" heading="h2"
                      body="Answer five questions and get sessions for every practice day up to your test, weighted to your weak skills. Or lay it out yourself.">
            <div className="plan-empty-go">
              {/* The planner weighs every skill, so it waits for the topics to load. */}
              <button type="button" className="btn primary" disabled={!roll.skills.length}
                      onClick={() => setWizard('auto')}>Make my plan</button>
              <button type="button" className="btn" onClick={() => setWizard('manual')}>Build it myself</button>
            </div>
          </EmptyState>
        </div>
        {dialogs}
      </>
    )
  }

  const progress = planProgress(plan)
  const late = missed(plan, today)
  const next = nextSession(plan, today)
  const weeks = new Map<string, PlanSession[]>()
  for (const s of [...plan.sessions].sort((a, b) => a.date.localeCompare(b.date))) {
    const w = weekOf(s.date)
    weeks.set(w, [...(weeks.get(w) ?? []), s])
  }
  const until = countdown({ date: plan.test_date, target: null, daily: null, updated_at: 0 })

  return (
    <>
      <PageHead tone="blue" eyebrow="Study plan" title="Plan"
                media={<Mascot mood={late.length ? 'think' : 'cheer'} size={72} />}
                sub={[until ?? `Test was ${shortDate(plan.test_date)}`, plan.target ? `Target ${plan.target}` : null,
                  `${fmt(progress.done)} of ${plural(progress.total, 'session')} done`,
                  late.length ? `${fmt(late.length)} behind` : 'On schedule'].filter(Boolean).join(' · ')}>
        <div className="plan-head-go">
          <button type="button" className="btn" onClick={() => setCalendar(true)}>
            <Icon name="calendar" size={16} strokeWidth={2} />Add to calendar
          </button>
        </div>
      </PageHead>
      <div className="plan">
        {late.length ? (
          <div className="plan-late" role="status">
            <Icon name="alert" size={18} strokeWidth={2} />
            <p>{plural(late.length, 'session')} from earlier {late.length === 1 ? 'was' : 'were'} not done.</p>
            <button type="button" className="btn sm" onClick={() => save(reflow(plan, today))}>Move to the next days</button>
          </div>
        ) : null}

        {next ? (
          <section className={`plan-next${next.session.filters.section ? ` sec-${next.session.filters.section}` : ''}`}
                   aria-labelledby="plan-next-t">
            <p className="plan-next-l">{next.today ? 'Today' : `Next: ${dayLabel(next.session.date)}`}</p>
            <h2 className="plan-next-t" id="plan-next-t">{next.session.title}</h2>
            <p className="plan-next-sub">
              {PHASE_NAME[next.session.phase]} · {plural(next.session.filters.size ?? questionsFor(plan.minutes), 'question')}
              {next.session.filters.speed ? ' · timed' : ''}
            </p>
            <button type="button" className="btn on-colour lg" onClick={() => onStartSession(next.session)}>
              {next.session.parts?.length ? 'Start next type' : 'Start'}<Icon name="arrow-right" size={16} strokeWidth={2.2} />
            </button>
          </section>
        ) : (
          <p className="about-p">No sessions left. Add one below, or make a new plan.</p>
        )}

        {[...weeks].map(([week, sessions]) => (
          <section key={week} className="plan-week" aria-label={`Week of ${shortDate(week)}`}>
            <div className="plan-week-h">
              <h3 className="plan-week-t">Week of {shortDate(week)}</h3>
              <span className="sr-only">{fmt(sessions.filter((s) => s.done_at).length)} of {fmt(sessions.length)} done</span>
              <span className="plan-dots" aria-hidden="true">
                {sessions.map((s) => (
                  <i key={s.id} className={s.done_at ? 'on' : s.date === today ? 'now' : s.date < today && !s.skipped ? 'late' : undefined} />
                ))}
              </span>
            </div>
            <ul className="plan-list">
              {sessions.map((s) => {
                const state = s.done_at ? 'done' : s.skipped ? 'skipped' : s.date < today ? 'missed' : s.date === today ? 'today' : 'ahead'
                return (
                  <li key={s.id} className={`plan-row is-${state}${s.filters.section ? ` sec-${s.filters.section}` : ''}`}>
                    <span className="plan-row-d">{dayLabel(s.date)}</span>
                    <span className="plan-row-main">
                      <span className="plan-row-t">{s.title}</span>
                      <span className="plan-row-sub">
                        {PHASE_NAME[s.phase]} · {fmt(s.filters.size ?? 0)} questions{s.filters.speed ? ' · timed' : ''}
                        {state === 'done' ? ' · done' : state === 'skipped' ? ' · skipped' : state === 'missed' ? ' · missed' : ''}
                      </span>
                      {s.parts?.length ? (
                        <PartList session={s} onStart={(ref) => onStartSession(s, ref)} onTick={(ref) => tickType(s.id, ref)} />
                      ) : null}
                    </span>
                    <span className="plan-row-go">
                      {state === 'done' ? <Icon name="check-circle" size={20} strokeWidth={2} /> : s.parts?.length ? null : (
                        <button type="button" className="btn sm" onClick={() => onStartSession(s)}>Start</button>
                      )}
                      <details className="plan-more">
                        <summary aria-label={`More for ${s.title}, ${dayLabel(s.date)}`}><Icon name="more" size={18} /></summary>
                        {/* Any choice closes the menu; the row redraws with the change. */}
                        <div className="plan-menu"
                             onClick={(e) => { (e.currentTarget.parentElement as HTMLDetailsElement).open = false }}>
                          <button type="button" onClick={() => setEditing(s)}>Edit</button>
                          {s.parts?.length ? null : s.done_at ? (
                            <button type="button" onClick={() => save(patchSession(plan, s.id, { done_at: undefined, set_id: undefined }))}>Mark not done</button>
                          ) : (
                            <button type="button" onClick={() => save(patchSession(plan, s.id, { done_at: Date.now() }))}>Mark done</button>
                          )}
                          {!s.done_at ? (
                            <button type="button" onClick={() => save(patchSession(plan, s.id, { skipped: !s.skipped }))}>
                              {s.skipped ? 'Unskip' : 'Skip'}
                            </button>
                          ) : null}
                          <button type="button" className="danger" onClick={() => save(removeSession(plan, s.id))}>Delete</button>
                        </div>
                      </details>
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}

        <div className="plan-foot">
          <button type="button" className="btn"
                  onClick={() => onPickTopics(null, nextSession(plan, today)?.session.date ?? today)}>
            Add a session
          </button>
          <button type="button" className="btn quiet" disabled={!roll.skills.length}
                  onClick={() => setConfirmReplace(true)}>Make a new plan</button>
          <button type="button" className="btn quiet" onClick={() => setConfirmDelete(true)}>Delete plan</button>
        </div>
      </div>
      {dialogs}
    </>
  )
}

/**
 * A day of process types as a checklist: each type has its own Start, and a
 * box to tick it off. The day is done when every type is ticked.
 */
function PartList({ session, onStart, onTick }: {
  session: PlanSession
  onStart: (ref: string) => void
  onTick: (ref: string) => void
}) {
  return (
    <ul className="plan-checks">
      {(session.parts ?? []).map((p) => {
        const done = Boolean(p.done_at)
        return (
          <li key={p.ref} className={done ? 'plan-check is-done' : 'plan-check'}>
            <button type="button" role="checkbox" aria-checked={done} className="plan-check-box"
                    aria-label={`${p.label}, ${fmt(p.n)} questions, ${done ? 'done' : 'not done'}`}
                    onClick={() => onTick(p.ref)}>
              <Icon name="check" size={12} strokeWidth={3} />
            </button>
            <span className="plan-check-t">{p.label}</span>
            <span className="plan-check-n">{fmt(p.n)}</span>
            {done ? null : <button type="button" className="btn sm" onClick={() => onStart(p.ref)}>Start</button>}
          </li>
        )
      })}
    </ul>
  )
}

/** The last day a session can go on: two before the test, as the planner does. */
function lastDay(testDate: string): string {
  const d = new Date(`${testDate}T00:00:00`)
  d.setDate(d.getDate() - 2)
  return dayKey(d)
}

function CalendarDialog({ sessions, minutes, onClose }: {
  sessions: readonly PlanSession[]; minutes: number; onClose: () => void
}) {
  const toast = useToast()
  const [time, setTime] = useState('19:00')
  const today = dayKey(new Date())
  const ahead = sessions.filter((s) => s.date >= today && !s.done_at && !s.skipped)
  function download() {
    saveBlob(planBlob({
      events: ahead.map((s) => ({ id: s.id, date: s.date, title: s.title, questions: s.filters.size ?? 0 })),
      time: /^\d{2}:\d{2}/.test(time) ? time : '19:00',
      minutes,
    }), PLAN_FILE)
    toast(`Saved ${PLAN_FILE}. Open it to add the sessions to your calendar.`)
    onClose()
  }
  return (
    <Modal title="Add your plan to a calendar" onClose={onClose}
           footer={<button type="button" className="btn primary" disabled={!ahead.length} onClick={download}>Download .ics</button>}>
      <div className="fb-form">
        <p className="fb-p">{plural(ahead.length, 'session')} from today, each with an alert at the time you pick.</p>
        <div className="fb-field">
          <label className="fb-label" htmlFor="plan-cal-time">Time</label>
          <input id="plan-cal-time" type="time" className="goal-input" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <p className="fb-note">Made in your browser. If you change the plan, download it again; most calendars update the same events.</p>
      </div>
    </Modal>
  )
}

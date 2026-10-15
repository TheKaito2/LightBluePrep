/**
 * Set or change the goal (G-02): test date, target score and daily count, each
 * optional. Opened from the score card and from Settings.
 */
import { useId, useState, type FormEvent } from 'react'
import { Modal } from './Modal'
import { DAILY_DEFAULT, TARGETS, saveGoal, type Goal } from '../lib/goal'
import { dayKey } from '../lib/progress'
import { toUserMessage } from '../lib/errors'

const DAILY = [5, 10, 15, 20, 25, 30, 40, 50]

export function GoalDialog({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const ids = useId()
  const [date, setDate] = useState(goal?.date ?? '')
  const [target, setTarget] = useState(goal?.target ? String(goal.target) : '')
  // A first goal starts on the default; an existing one keeps "off" if chosen.
  const [daily, setDaily] = useState(goal ? (goal.daily ? String(goal.daily) : '') : String(DAILY_DEFAULT))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const today = dayKey(new Date())

  async function submit(e: FormEvent) {
    e.preventDefault()
    // `min` only steers the picker; a typed date can still be in the past.
    if (date && date < today) { setError('Pick today or a later date.'); return }
    setBusy(true)
    try {
      await saveGoal({ date: date || null, target: target ? Number(target) : null, daily: daily ? Number(daily) : null })
      onClose()
    } catch (err) {
      setError(toUserMessage(err)); setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await saveGoal(null)
      onClose()
    } catch (err) {
      setError(toUserMessage(err)); setBusy(false)
    }
  }

  const formId = `${ids}form`
  return (
    <Modal title={goal ? 'Your goal' : 'Set your goal'} onClose={onClose}
           footer={(
             <>
               {goal ? (
                 <button type="button" className="btn" disabled={busy} onClick={() => { void remove() }}>
                   Remove goal
                 </button>
               ) : null}
               <button type="submit" form={formId} className="btn primary" disabled={busy}>Save goal</button>
             </>
           )}>
      <form id={formId} className="fb-form" onSubmit={(e) => { void submit(e) }} noValidate>
        <p className="fb-p">Every part is optional. It stays on this device.</p>
        <div className="fb-field">
          <label className="fb-label" htmlFor={`${ids}date`}>Test date</label>
          <input id={`${ids}date`} type="date" className="goal-input" min={today} value={date}
                 aria-describedby={`${ids}date-hint`} aria-invalid={error ? true : undefined}
                 onChange={(e) => { setDate(e.target.value); setError(null) }} />
          <p id={`${ids}date-hint`} className="fb-note">The score card counts down to it.</p>
          {error ? <p className="fb-err" role="alert">{error}</p> : null}
        </div>
        <div className="fb-field">
          <label className="fb-label" htmlFor={`${ids}target`}>Target score</label>
          <select id={`${ids}target`} className="sel goal-input" value={target}
                  onChange={(e) => setTarget(e.target.value)}>
            <option value="">No target</option>
            {TARGETS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="fb-field">
          <label className="fb-label" htmlFor={`${ids}daily`}>Daily goal</label>
          <select id={`${ids}daily`} className="sel goal-input" value={daily}
                  aria-describedby={`${ids}daily-hint`} onChange={(e) => setDaily(e.target.value)}>
            <option value="">No daily goal</option>
            {DAILY.map((n) => <option key={n} value={n}>{n} questions a day</option>)}
          </select>
          <p id={`${ids}daily-hint`} className="fb-note">Shown as a ring around the streak flame.</p>
        </div>
      </form>
    </Modal>
  )
}

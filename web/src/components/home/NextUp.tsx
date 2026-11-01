import { Icon } from '../Icon'
import { describeSet, fmt, plural } from '../../lib/labels'
import type { PlanSession } from '../../lib/plan'
import type { PracticeSet } from '../../types'

/** "Thursday" within a week, else "Oct 29". */
function dayName(date: string): string {
  const d = new Date(`${date}T00:00:00`)
  const days = (d.getTime() - Date.now()) / 86_400_000
  return days < 6
    ? d.toLocaleDateString('en-US', { weekday: 'long' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * The one thing to do next, if there is one: a session planned for today leads,
 * then the set to carry on, then the next session, then making a plan.
 */
export function NextUp({ planNext, hasPlan, planStarted, resumable, onStartPlan, onResume }: {
  /** Today's plan session, else the next one; null with no plan or nothing left. */
  planNext: { session: PlanSession; today: boolean } | null
  /** Whether a plan exists at all. */
  hasPlan: boolean
  /** Today's session has a set under way: the button carries on with it. */
  planStarted: boolean
  /** The set "carry on" means, if any. */
  resumable: PracticeSet | null
  onStartPlan: (s: PlanSession) => void
  onResume: (id: string) => void
}) {
  const today = planNext?.today ? planNext.session : null
  const label = today ? "Today's plan"
    : resumable ? 'Pick up where you left off'
    : planNext ? `Next session · ${dayName(planNext.session.date)}`
    : 'Study plan'
  const title = today ? today.title
    : resumable ? describeSet(resumable, false)
    : planNext ? planNext.session.title
    : 'Plan every day up to your test'
  const meta = today ? plural(today.filters.size ?? 0, 'question')
    : resumable ? `${fmt(resumable.answered)} of ${fmt(resumable.total)} answered`
    : null
  return (
    <section className="nextup" aria-label="What to do next">
      <div className="nextup-txt">
        <span className="nextup-l">{label}</span>
        <h2 className="nextup-t">{title}</h2>
        {meta ? <p className="nextup-m">{meta}</p> : null}
      </div>
      {today ? (
        <button className="btn on-colour lg nextup-go" onClick={() => onStartPlan(today)}>
          {planStarted ? 'Continue' : 'Start'}<Icon name="arrow-right" size={16} strokeWidth={2.2} />
        </button>
      ) : resumable ? (
        <button className="btn on-colour lg nextup-go" onClick={() => onResume(resumable.id)}>
          Resume<Icon name="arrow-right" size={16} strokeWidth={2.2} />
        </button>
      ) : (
        <a className="btn on-colour lg nextup-go" href="#plan">
          <Icon name="calendar" size={16} strokeWidth={2} />{hasPlan ? 'My plan' : 'Make a plan'}
        </a>
      )}
      {/* Today's plan leads, but a half-done set of another kind stays one click away. */}
      {today && resumable && !planStarted ? (
        <button className="nextup-alt" onClick={() => onResume(resumable.id)}>
          Resume {describeSet(resumable, false)}
        </button>
      ) : null}
    </section>
  )
}

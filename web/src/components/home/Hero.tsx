import { Icon } from '../Icon'
import { Mascot } from '../Mascot'
import { ProgressStrip } from '../ProgressStrip'
import { describeSet, fmt } from '../../lib/labels'
import type { HistoryRow } from '../../lib/progress'
import type { PlanSession } from '../../lib/plan'
import type { PracticeSet, SetItem, Stats } from '../../types'
import { IdSearch } from './IdSearch'

/** "Thursday" within a week, else "Oct 29". */
function dayName(date: string): string {
  const d = new Date(`${date}T00:00:00`)
  const days = (d.getTime() - Date.now()) / 86_400_000
  return days < 6
    ? d.toLocaleDateString('en-US', { weekday: 'long' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Scroll to the topic picker and put focus on its heading. */
function chooseTopics() {
  const head = document.getElementById('topics-title')
  if (!head) return
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  head.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' })
  head.focus({ preventScroll: true })
}

/** Home's hero band: Bulb, the headline, the main action, the ID search and the score card. */
export function Hero({
  total, seen, resumable, onResume, findIds, onOpenId, history, stats, onScoreCheck, planNext, hasPlan, onStartPlan,
}: {
  /** Questions in the bank; 0 while the list is still loading. */
  total: number
  /** How many of them have an answer. */
  seen: number
  /** The set "carry on" means, if any. */
  resumable: PracticeSet | null
  onResume: (id: string) => void
  findIds: (needle: string) => Promise<{ hits: SetItem[]; total: number }>
  onOpenId: (id: string) => void
  history: HistoryRow[]
  stats: Stats | null
  onScoreCheck: () => void
  /** Today's plan session, else the next one; null with no plan or nothing left. */
  planNext: { session: PlanSession; today: boolean } | null
  /** Whether a plan exists at all, for the "Make a study plan" link. */
  hasPlan: boolean
  onStartPlan: (s: PlanSession) => void
}) {
  return (
    <section className="hero2" aria-label="Overview">
      <div className="hero2-in">
        <div className="hero2-copy">
          <Mascot className="hero2-bulb" mood="cheer" size={88} />
          <span className="hero2-eyebrow">
            {total ? `${fmt(total)} official questions` : 'Official questions'} · Always free
          </span>
          <h1 className="hero2-t" tabIndex={-1}>Pick a topic.<br /><span className="hero2-hl">Start drilling.</span></h1>
          <p className="hero2-sub">
            <span className="desk">Every question in College Board's official question bank, sorted by skill. No account, no ads.</span>
            <span className="phone">Official College Board questions. Free, no account.</span>
          </p>
          {planNext && !planNext.today ? (
            <a className="hero2-plan" href="#plan">
              <Icon name="calendar" size={16} strokeWidth={2} />
              Next session {dayName(planNext.session.date)}: {planNext.session.title}
            </a>
          ) : !hasPlan ? (
            <a className="hero2-plan" href="#plan">
              <Icon name="calendar" size={16} strokeWidth={2} />Make a study plan for your test date
            </a>
          ) : null}
          <div className="hero2-go">
            {planNext?.today ? (
              // A session planned for today leads: it is the thing to do now.
              <button className="btn primary lg hero2-main" onClick={() => onStartPlan(planNext.session)}>
                <span className="hero2-main-t">Today's plan · {planNext.session.title}</span>
                <span className="hero2-main-n">({fmt(planNext.session.filters.size ?? 0)})</span>
                <Icon name="arrow-right" size={16} strokeWidth={2.2} />
              </button>
            ) : resumable ? (
              <button className="btn primary lg hero2-main" onClick={() => onResume(resumable.id)}>
                <span className="hero2-main-t">Resume · {describeSet(resumable, false)}</span>
                <span className="hero2-main-n">({fmt(resumable.answered)}/{fmt(resumable.total)})</span>
                <Icon name="arrow-right" size={16} strokeWidth={2.2} />
              </button>
            ) : (
              // No set to carry on: the topics are the next step, so they lead.
              <button className="btn primary lg hero2-main" onClick={chooseTopics}>
                <span className="desk">Choose topics</span><span className="phone">Topics</span>
                <Icon name="arrow-right" size={16} strokeWidth={2.2} />
              </button>
            )}
            {planNext?.today && resumable ? (
              <button className="btn lg" onClick={() => onResume(resumable.id)}>Resume</button>
            ) : planNext?.today || resumable ? (
              <button className="btn lg" onClick={chooseTopics}>
                <span className="desk">Choose topics</span><span className="phone">Topics</span>
              </button>
            ) : null}
          </div>
          <IdSearch findIds={findIds} onOpenId={onOpenId} />
        </div>
        <ProgressStrip history={history} covered={seen} total={total}
                       attempts={stats?.attempts ?? 0} correct={stats?.correct ?? 0}
                       onScoreCheck={onScoreCheck} />
      </div>
    </section>
  )
}

import { Icon } from '../Icon'
import { Mascot } from '../Mascot'
import { ProgressStrip } from '../ProgressStrip'
import { describeSet, fmt } from '../../lib/labels'
import type { HistoryRow } from '../../lib/progress'
import type { PracticeSet, SetItem, Stats } from '../../types'
import { IdSearch } from './IdSearch'

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
  total, seen, resumable, onResume, onQuickStart, findIds, onOpenId, history, stats, onScoreCheck,
}: {
  /** Questions in the bank; 0 while the list is still loading. */
  total: number
  /** How many of them have an answer. */
  seen: number
  /** The set "carry on" means, if any. */
  resumable: PracticeSet | null
  onResume: (id: string) => void
  onQuickStart: () => void
  findIds: (needle: string) => Promise<{ hits: SetItem[]; total: number }>
  onOpenId: (id: string) => void
  history: HistoryRow[]
  stats: Stats | null
  onScoreCheck: () => void
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
            <span className="desk">Every official College Board practice question, sorted by skill. No account, no ads.</span>
            <span className="phone">Official College Board questions. Free, no account.</span>
          </p>
          <div className="hero2-go">
            {resumable ? (
              <button className="btn primary lg hero2-main" onClick={() => onResume(resumable.id)}>
                <span className="hero2-main-t">Resume · {describeSet(resumable, false)}</span>
                <span className="hero2-main-n">({fmt(resumable.answered)}/{fmt(resumable.total)})</span>
                <Icon name="arrow-right" size={16} strokeWidth={2.2} />
              </button>
            ) : (
              <button className="btn primary lg hero2-main" onClick={onQuickStart} disabled={!total}>
                <span className="desk">Start a 10-question set</span><span className="phone">Start 10 questions</span>
                <Icon name="arrow-right" size={16} strokeWidth={2.2} />
              </button>
            )}
            <button className="btn lg" onClick={chooseTopics}>
              <span className="desk">Choose topics</span><span className="phone">Topics</span>
            </button>
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

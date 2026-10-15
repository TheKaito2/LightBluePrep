/**
 * The review page a set gets in place of Bluebook's.
 *
 * On the real test the question navigator carries a "Go to Review Page" button
 * and that page is a full screen of the same grid: every question in the module,
 * marked answered, unanswered or flagged, with the legend above it. This is
 * that screen. The reference screenshot in reference/ is of the popup rather
 * than the page itself, so the grid and the legend are taken from the popup and
 * the page around them is ours.
 *
 * A set is graded when it ends, the same as a module, so the cells here say
 * answered or not and nothing about right or wrong.
 */
import { useId, useRef, type ReactNode } from 'react'
import { Icon } from './Icon'
import { useDialogFocus } from '../lib/useFocusTrap'
import { NavCell, cellState, type CellState } from './Navigator'
import { VERDICT, fmt, plural } from '../lib/labels'
import type { SetItem } from '../types'

interface Props {
  items: SetItem[]
  current: number
  title: string
  /** Null when the set is untimed. */
  remaining: number | null
  clock: string | null
  onGo: (index: number) => void
  onClose: () => void
  onFinish: () => void
  /** Grading and saving: Finish is locked so a second click cannot grade twice. */
  busy?: boolean
  /** A failed finish is reported here, since this page covers the practice screen. */
  banner?: ReactNode
  /** This set's own progress, which is not the same as each question's history. */
  states?: CellState[]
}

export function SetReview({
  items, current, title, remaining, clock, onGo, onClose, onFinish, states, busy, banner,
}: Props) {
  const stateAt = (i: number) => states?.[i] ?? cellState(items[i])
  const unanswered = items.filter((_, i) => stateAt(i) === 'unanswered').length
  const marked = items.filter((i) => i.flagged).length
  const titleId = useId()
  const box = useRef<HTMLDivElement>(null)
  const backBtn = useRef<HTMLButtonElement>(null)
  useDialogFocus(box, backBtn)

  return (
    // A full-screen page in looks, but it sits over the question screen, so
    // to a screen reader and the keyboard it is a dialog like the navigator.
    <div ref={box} className="setreview" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="setreview-top">
        <button ref={backBtn} className="ghostlink" onClick={onClose}>
          <Icon name="chevron-left" size={15} strokeWidth={2.2} />
          Back to question {current + 1}
        </button>
        {clock ? (
          // The last minute is bold with a clock glyph as well as red, so it
          // does not rely on colour alone.
          <span role="timer" aria-label="Time remaining"
                className={remaining !== null && remaining <= 60
                  ? 'setreview-clock is-low' : 'setreview-clock'}>
            {remaining !== null && remaining <= 60 ? <Icon name="clock" size={17} strokeWidth={2.4} /> : null}
            {clock}
          </span>
        ) : null}
      </header>
      {banner}

      <div className="setreview-body">
        <h1 id={titleId} className="setreview-h">Check Your Work</h1>
        <p className="setreview-sub">
          {title} · {plural(items.length, 'question')}
          {unanswered ? ` · ${fmt(unanswered)} unanswered` : ''}
          {marked ? ` · ${fmt(marked)} marked` : ''}
        </p>

        <div className="nav-legend setreview-legend">
          <span><i className="key key-unanswered" /> {VERDICT.unanswered}</span>
          <span><i className="key key-answered" /> Answered</span>
          <span><i className="key key-marked" /> Marked</span>
        </div>

        <div className="nav-grid setreview-grid">
          {items.map((item, i) => (
            <NavCell key={item.id} item={item} index={i} state={stateAt(i)}
                     isCurrent={i === current} onPick={(n) => { onGo(n); onClose() }} />
          ))}
        </div>

        <div className="setreview-foot">
          <button className="btn primary lg" onClick={onFinish} disabled={busy}>
            {busy ? 'Finishing…' : (
              <>
                Finish set
                <Icon name="arrow-right" size={18} strokeWidth={2.2} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

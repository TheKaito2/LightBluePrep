import { memo, useRef, useState, type FormEvent } from 'react'
import { Icon } from './Icon'
import { useDialogFocus } from '../lib/useFocusTrap'
import { DIFFICULTY_NAME, VERDICT, fmt, plural } from '../lib/labels'
import { cellState, type CellState } from '../lib/sets'
import type { SetItem } from '../types'

interface Props {
  items: SetItem[]
  current: number
  title: string
  onGo: (index: number) => void
  onClose: () => void
  /**
   * Only a practice set has one. Bluebook puts this button in exactly this
   * spot, under the grid, and it is how you reach the end-of-module review
   * page; open practice has no end to review, so it has no button.
   */
  onReviewPage?: () => void
  /** Everything in the set is answered, so the way out is the obvious action. */
  complete?: boolean
  /**
   * Cell state per question, when the caller knows better than the question's
   * own history does. A practice set does: its cells have to show how THIS set
   * is going, not whether you happened to answer the same question last week.
   */
  states?: CellState[]
}

const SPOKEN: Record<CellState, string> = {
  unanswered: VERDICT.unanswered,
  answered: 'answered',
  first: VERDICT.correct,
  retry: VERDICT.retry,
  wrong: VERDICT.incorrect,
}

/**
 * What a cell says to a screen reader: "Question 7, incorrect, marked for
 * review. Words in Context, Hard". The skill and difficulty used to sit in a
 * title tooltip that keyboard, touch and screen readers never got.
 */
function cellLabel(index: number, state: CellState, item: SetItem) {
  return `Question ${index + 1}, ${SPOKEN[state].toLowerCase()}${item.flagged ? ', marked for review' : ''}`
    + `. ${item.skill_name}, ${DIFFICULTY_NAME[item.difficulty] ?? item.difficulty}`
}

/**
 * One numbered cell, shared by the navigator and the set's review page.
 *
 * The verdict colours alone fail anyone who cannot tell green from red, so a
 * graded cell also carries a tick or a cross. A set's cells are never graded,
 * so they never get one.
 */
export function NavCell({ item, index, state, isCurrent, onPick }: {
  item: SetItem; index: number; state: CellState; isCurrent: boolean; onPick: (index: number) => void
}) {
  const glyph = state === 'wrong' ? 'close' : state === 'first' || state === 'retry' ? 'check' : null
  return (
    <button
      className={`nav-cell is-${state}${isCurrent ? ' is-current' : ''}${item.flagged ? ' is-flagged' : ''}`}
      onClick={() => onPick(index)}
      aria-label={cellLabel(index, state, item)}
      aria-current={isCurrent ? 'step' : undefined}
    >
      {glyph ? <Icon name={glyph} size={12} strokeWidth={3} className="nav-cell-glyph" /> : null}
      {index + 1}
    </button>
  )
}

/**
 * Cells per page. Open practice over every topic is 3,767 questions, and
 * rendering all of them took 1.7s to open at 4x CPU throttling. A page of 100
 * is still more than any set and opens at once.
 */
export const PAGE = 100

/**
 * Memoised because App re-renders on every tick of the question clock; with
 * stable props from App the open grid is left alone between ticks.
 */
export const Navigator = memo(function Navigator({
  items, current, title, onGo, onClose, onReviewPage, states, complete,
}: Props) {
  const paged = items.length > PAGE
  const [page, setPage] = useState(() => Math.floor(current / PAGE))
  const [target, setTarget] = useState('')
  const pages = Math.ceil(items.length / PAGE)
  const start = paged ? page * PAGE : 0
  const shown = paged ? items.slice(start, start + PAGE) : items
  const pick = (index: number) => { onGo(index); onClose() }
  const box = useRef<HTMLDivElement>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)
  useDialogFocus(box, closeBtn)

  const jump = (event: FormEvent) => {
    event.preventDefault()
    const n = Number(target)
    if (!Number.isInteger(n) || n < 1 || n > items.length) return
    pick(n - 1)
  }

  return (
    <>
      <div className="nav-scrim" onClick={onClose} />
      <div ref={box} className="nav-popup" role="dialog" aria-modal="true" aria-label="Go to question">
        <div className="nav-head">
          <div className="nav-title">{title}</div>
          <button ref={closeBtn} className="nav-close" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="nav-legend">
          <span><i className="key key-unanswered" /> {VERDICT.unanswered}</span>
          {/* A set is graded when it ends, so mid-set there is nothing to say
              about right or wrong. */}
          {states ? (
            <span><i className="key key-answered" /> Answered</span>
          ) : (
            <>
              <span><i className="key key-first"><Icon name="check" size={10} strokeWidth={3.4} /></i> {VERDICT.correct}</span>
              <span><i className="key key-retry"><Icon name="check" size={10} strokeWidth={3.4} /></i> {VERDICT.retry}</span>
              <span><i className="key key-wrong"><Icon name="close" size={10} strokeWidth={3.4} /></i> {VERDICT.incorrect}</span>
            </>
          )}
          <span><i className="key key-marked" /> Marked</span>
        </div>

        {paged ? (
          <div className="nav-pager">
            <button className="btn small" onClick={() => setPage(page - 1)} disabled={page <= 0}>
              <Icon name="chevron-left" size={15} strokeWidth={2.2} />
              Previous 100
            </button>
            <span className="nav-range" aria-live="polite">
              {fmt(start + 1)}–{fmt(start + shown.length)} of {fmt(items.length)}
            </span>
            <button className="btn small" onClick={() => setPage(page + 1)} disabled={page >= pages - 1}>
              Next 100
              <Icon name="chevron-right" size={15} strokeWidth={2.2} />
            </button>
          </div>
        ) : null}

        <div className="nav-grid">
          {shown.map((item, i) => {
            const index = start + i
            return (
              <NavCell key={item.id} item={item} index={index}
                       state={states?.[index] ?? cellState(item)}
                       isCurrent={index === current} onPick={pick} />
            )
          })}
        </div>

        <div className="nav-foot">
          {onReviewPage ? (
            <button className={complete ? 'btn primary nav-review' : 'btn nav-review'}
                    onClick={onReviewPage}>
              Go to Review Page
            </button>
          ) : null}
          {paged ? (
            <form className="nav-goto" onSubmit={jump}>
              <label htmlFor="nav-goto-n">Go to #</label>
              <input id="nav-goto-n" type="number" inputMode="numeric" min={1} max={items.length}
                     value={target} onChange={(e) => setTarget(e.target.value)} />
              <button className="btn small" type="submit">Go</button>
            </form>
          ) : null}
          {/* Only a set has `states`; anything else is a list of questions. */}
          <span>{plural(items.length, 'question')} in this {states ? 'set' : 'list'}</span>
        </div>
      </div>
    </>
  )
})

import { useEffect, useRef, useState } from 'react'
import { RichText } from './RichText'
import { Icon } from './Icon'
import { duration } from '../lib/pacing'
import { VERDICT } from '../lib/labels'
import type { GradeResult, Question } from '../types'

interface Props {
  result: GradeResult
  question: Question
  seconds: number
  /**
   * Start expanded. Practice keeps it collapsed behind the verdict so you get
   * the result before the reasoning; Review is the opposite, you came here to
   * read the reasoning.
   */
  startOpen?: boolean
  /** Marked in Review but never answered: show the key, not a verdict. */
  unanswered?: boolean
  /**
   * No Hide button. A review panel is opened to read this, and the row above
   * already folds the whole panel away.
   */
  hideToggle?: boolean
  /**
   * Just graded in practice: bring the verdict into view and put focus on the
   * Explain button. Submit unmounts itself, so focus would otherwise fall to
   * the body, and on a tall question the verdict landed below the fold.
   */
  autoFocus?: boolean
}

/** Status badge: an icon and the word, so the verdict is not colour alone. */
function Verdict({ correct }: { correct: boolean }) {
  return (
    <span className={correct ? 'badge verdict ok' : 'badge verdict bad'}>
      <Icon name={correct ? 'check' : 'close'} size={12} strokeWidth={2.8} />
      {correct ? VERDICT.correct : VERDICT.incorrect}
    </span>
  )
}

/**
 * Post-answer review. Every word here is College Board's own rationale text;
 * nothing is generated.
 */
export function Explanation({
  result, question, seconds, startOpen = false, unanswered = false, hideToggle = false,
  autoFocus = false,
}: Props) {
  const [open, setOpen] = useState(startOpen)
  const isMcq = question.type === 'mcq'
  const explainBtn = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  // Where focus goes after the student opens or hides the panel. Null on
  // mount, so a panel that starts open (Review) never steals focus.
  const moveFocus = useRef<'panel' | 'button' | null>(autoFocus ? 'button' : null)

  useEffect(() => {
    const target = moveFocus.current
    moveFocus.current = null
    if (target === 'panel') {
      // The first heading, or the Full explanation toggle when there is none.
      panel.current?.querySelector<HTMLElement>('h3, summary')?.focus()
    } else if (target === 'button' && explainBtn.current) {
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      explainBtn.current.parentElement?.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' })
      explainBtn.current.focus({ preventScroll: true })
    }
  }, [open])

  function toggle(next: boolean) {
    moveFocus.current = next ? 'panel' : 'button'
    setOpen(next)
  }

  if (!open) {
    return (
      <div className="explain-bar">
        <Verdict correct={result.correct} />
        {/* A wrong grid-in never showed the right value without a click. */}
        <span className="verdict-answer">Answer: {result.accepted.join(' or ')}</span>
        <span className="verdict-time">{duration(seconds)} on this question</span>
        <button ref={explainBtn} className="btn primary" onClick={() => toggle(true)}>
          {isMcq ? 'Explain answer choices' : 'Show explanation'}
        </button>
      </div>
    )
  }

  return (
    <div className="explain" ref={panel}>
      <div className="explain-head">
        {unanswered ? <span className="verdict-time">{VERDICT.unanswered}</span> : (<>
          <Verdict correct={result.correct} />
          <span className="verdict-time">{duration(seconds)} on this question</span>
        </>)}
        {hideToggle ? null : <button className="btn quiet" onClick={() => toggle(false)}>Hide</button>}
      </div>

      <div className="explain-answer">
        <div>
          <span className="label">Correct answer</span>
          {/* Several accepted forms is normal, and sometimes they are genuinely
              different valid answers rather than spellings of one. Show all. */}
          <span className="accepted">{result.accepted.join('   or   ')}</span>
        </div>
        {!result.correct && result.response ? (
          <div>
            <span className="label">You answered</span>
            <span className="yours">{result.response}</span>
          </div>
        ) : null}
        {result.match === 'equivalent' ? (
          <p className="note">
            Accepted as numerically equal to the official answer.
          </p>
        ) : null}
      </div>

      {isMcq && (result.why_wrong_html || result.why_right_html) ? (
        <div className="explain-choices">
          {result.why_wrong_html ? (
            <section className="why why-wrong">
              <h3 tabIndex={-1}>Why {result.response} is wrong</h3>
              <RichText html={result.why_wrong_html} field="why_wrong" />
            </section>
          ) : null}
          {result.why_right_html ? (
            <section className="why why-right">
              <h3 tabIndex={-1}>Why {result.accepted[0]} is right</h3>
              <RichText html={result.why_right_html} field="why_right" />
            </section>
          ) : null}
        </div>
      ) : null}

      {question.letters_differ ? (
        <p className="note small">
          College Board's explanation below calls the choices by different letters
          than this question shows, so read its letters with care.
        </p>
      ) : null}
      {result.rationale_html ? (
        <details className="explain-full" open={!isMcq}>
          <summary>Full explanation</summary>
          <RichText html={result.rationale_html} field="rationale" />
        </details>
      ) : null}

      {question.key_recovered ? (
        <p className="note small">
          College Board's data was missing the answer key for this question, so
          it was taken from the official explanation.
        </p>
      ) : null}
    </div>
  )
}

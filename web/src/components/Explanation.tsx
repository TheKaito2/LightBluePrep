import { useState } from 'react'
import { RichText } from './RichText'
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
}

/**
 * Post-answer review. Every word here is College Board's own rationale text;
 * nothing is generated.
 */
export function Explanation({
  result, question, seconds, startOpen = false, unanswered = false, hideToggle = false,
}: Props) {
  const [open, setOpen] = useState(startOpen)
  const isMcq = question.type === 'mcq'

  if (!open) {
    return (
      <div className="explain-bar">
        <span className={result.correct ? 'verdict ok' : 'verdict no'}>
          {result.correct ? VERDICT.correct : VERDICT.incorrect}
        </span>
        <span className="verdict-time">{duration(seconds)}</span>
        <button className="btn primary" onClick={() => setOpen(true)}>
          Explain answer choices
        </button>
      </div>
    )
  }

  return (
    <div className="explain">
      <div className="explain-head">
        {unanswered ? <span className="verdict-time">{VERDICT.unanswered}</span> : (<>
          <span className={result.correct ? 'verdict ok' : 'verdict no'}>
            {result.correct ? VERDICT.correct : VERDICT.incorrect}
          </span>
          <span className="verdict-time">{duration(seconds)} on this question</span>
        </>)}
        {hideToggle ? null : <button className="btn ghost" onClick={() => setOpen(false)}>Hide</button>}
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
              <h4>Why {result.response} is wrong</h4>
              <RichText html={result.why_wrong_html} field="why_wrong" />
            </section>
          ) : null}
          {result.why_right_html ? (
            <section className="why why-right">
              <h4>Why {result.accepted[0]} is right</h4>
              <RichText html={result.why_right_html} field="why_right" />
            </section>
          ) : null}
        </div>
      ) : null}

      {result.rationale_html ? (
        <details className="explain-full" open={!isMcq}>
          <summary>Full explanation</summary>
          <RichText html={result.rationale_html} field="rationale" />
        </details>
      ) : null}

      {question.key_recovered ? (
        <p className="note small">
          The answer key for this question was recovered from the official
          rationale text, because the bank shipped it without one.
        </p>
      ) : null}
    </div>
  )
}

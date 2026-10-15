/**
 * One answered question, read back.
 *
 * The panel behind a row on the Review page and behind a row on a finished
 * set's score screen. Both want the same thing: the question, every attempt at
 * it, whatever you logged about it, and the explanation already open, since you
 * came here to read the reasoning rather than to be told the verdict.
 *
 * `response` is the answer being reviewed, and it is not always the latest one.
 * On the Review page it is the last attempt; inside a set it is the answer that
 * set recorded, which is what makes a set you finished last week still read
 * back as it scored. `explain` re-grades whatever it is handed and records
 * nothing, so opening a row never logs a fresh attempt.
 */
import { useEffect, useState } from 'react'
import * as api from '../api'
import { Explanation } from './Explanation'
import { MistakeFields, TAG_LABEL } from './MistakeFields'
import { loadProcessTypes, similarTo, typeOf, type ProcessType } from '../lib/similar'
import { RichText } from './RichText'
import { Icon } from './Icon'
import { duration } from '../lib/pacing'
import { VERDICT } from '../lib/labels'
import { toUserMessage } from '../lib/errors'
import type {
  Annotation, Attempt, GradeResult, Mistake, MistakeTag, Question,
} from '../types'

const clock = (ts: number | null) => (ts
  ? new Date(ts * 1000).toLocaleString(undefined,
    { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : '')

interface Props {
  id: string
  /** The answer being reviewed. Null where the question was left blank. */
  response: string | null
  seconds: number
  onPractice: (id: string) => void
  /** Feeds Review's note filters: the tags, or null for no log. */
  onLogged?: (id: string, tags: MistakeTag[] | null) => void
  /**
   * Log the mistake here rather than only read it back. On for a finished
   * set's score screen, which is the first place in a set you learn whether
   * you got it right, and so the first place logging one means anything.
   */
  editable?: boolean
  /** Practise questions solved the same way. Absent hides the block. */
  onPracticeMany?: (ids: string[], title: string) => void
  /**
   * Read back from a finished set: its start and finish, unix seconds. The
   * attempts table then marks the set's own attempt among the others, and
   * drops out when that attempt is the only one, since the row already says it.
   */
  setWindow?: { from: number; to: number }
  /**
   * The verdict stored when `response` was answered. The panel re-grades
   * against today's key, which is the truth; when the two differ it says so,
   * and `onRegrade` lets the row above it change its badge to match.
   */
  graded?: boolean
  onRegrade?: (id: string, correct: boolean) => void
}

export function QuestionDetail({
  id, response, seconds, onPractice, onLogged, editable, onPracticeMany, setWindow, graded, onRegrade,
}: Props) {
  const [data, setData] = useState<{
    question: Question; annotations: Annotation[]; mistake: Mistake | null
  } | null>(null)
  /**
   * The rationale is deliberately NOT on the question payload, so it has to be
   * asked for separately.
   */
  const [result, setResult] = useState<GradeResult | null>(null)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [showPassage, setShowPassage] = useState(false)
  // Folded by default. The panel already carries the question, the choices,
  // the attempts table and the explanation, and most rows never get a log.
  const [showLog, setShowLog] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Kept apart from `error`, which replaces the whole panel. A save that fails
  // should say so without throwing away the question you were reading.
  const [logError, setLogError] = useState<string | null>(null)
  const [similar, setSimilar] = useState<{ type: ProcessType | null; ids: string[] } | null>(null)

  useEffect(() => {
    let stale = false
    Promise.all([
      api.question(id),
      api.explain(id, response),
      api.attemptsFor(id),
    ])
      .then(([q, r, a]) => {
        if (stale) return
        setData(q); setResult(r); setAttempts(a.attempts)
        // A highlight in the passage is a reason to open it.
        setShowPassage(q.annotations.some((n) => n.field === 'stimulus'))
        onLogged?.(id, q.mistake ? q.mistake.tags : null)
        if (response !== null && graded !== undefined && r.correct !== graded) onRegrade?.(id, r.correct)
      })
      .catch((e: Error) => !stale && setError(toUserMessage(e)))
    return () => { stale = true }
  }, [id, response, onLogged, graded, onRegrade])

  // Once the question is in, find the others of its process type.
  const q = data?.question
  useEffect(() => {
    if (!q || !onPracticeMany) return
    let stale = false
    Promise.all([loadProcessTypes(), api.questionSet({})]).then(([pt, pool]) => {
      if (stale || !pt) return
      setSimilar({ type: typeOf(q.cb_id, pt), ids: similarTo(q, pool.questions, pt).map((s) => s.id) })
    }).catch(() => { /* the block just stays hidden */ })
    return () => { stale = true }
  }, [q, onPracticeMany])

  if (error) return <p className="review-empty">{error}</p>
  if (!data || !result) {
    // The shape of what is coming, a stem line over four choices, so the
    // panel opens at about its real height instead of jumping.
    return (
      <div className="review-detail" aria-busy="true">
        <span className="sr-only" role="status">Loading the question</span>
        <span className="skel qd-skel-stem" />
        <span className="skel qd-skel-stem short" />
        {[0, 1, 2, 3].map((i) => <span key={i} className="skel qd-skel-choice" />)}
      </div>
    )
  }

  const hasLog = Boolean(data.mistake
    && (data.mistake.tags.length || data.mistake.note))
  // The set's own attempt: the last one inside its window.
  const setAttempt = setWindow
    ? attempts.findLastIndex((a) => a.answered_at >= setWindow.from && a.answered_at <= setWindow.to)
    : -1
  const showAttempts = setWindow ? attempts.length > 1 : attempts.length > 0
  const regraded = response !== null && graded !== undefined && result.correct !== graded

  function saveMistake(tags: MistakeTag[], note: string | null) {
    setLogError(null)
    // Returned so the fields can confirm "Saved"; rethrown so they do not.
    return api.saveMistake(id, tags, note)
      .then((r) => {
        setData((d) => (d ? { ...d, mistake: r.mistake } : d))
        onLogged?.(id, r.mistake && (r.mistake.tags.length || r.mistake.note)
          ? r.mistake.tags : null)
      })
      .catch((e: Error) => { setLogError(toUserMessage(e)); throw e })
  }

  return (
    <div className={`review-detail sec-${data.question.section}`}>
      {/* The passage is the longest thing here and you usually remember it, so
          it starts folded and the question stays at the top of the panel,
          unless you highlighted something in it. */}
      {data.question.stimulus_html ? (
        <>
          <button className="btn small review-toggle"
                  onClick={() => setShowPassage((v) => !v)}>
            {showPassage ? 'Hide passage' : 'Show passage'}
            <Icon name={showPassage ? 'chevron-up' : 'chevron-down'}
                  size={14} strokeWidth={2.2} />
          </button>
          {showPassage ? (
            <div className="review-passage">
              <RichText html={data.question.stimulus_html} field="stimulus" annotations={data.annotations} />
            </div>
          ) : null}
        </>
      ) : null}

      <div className="review-stem">
        <RichText html={data.question.stem_html} field="stem" annotations={data.annotations} />
      </div>

      {/* The explanation below talks about the choices by letter, so without
          the choices themselves "Why B is wrong" says nothing. Same markup and
          the same colours practice uses once you have answered: green is the
          key and red is a wrong pick, so a green pick is a right answer. */}
      {data.question.type === 'mcq' && data.question.options ? (
        <ul className="choices static">
          {data.question.options.map((option) => {
            const isPicked = response === option.label
            const isKey = result.accepted.includes(option.label)
            return (
              <li key={option.label}
                  className={[
                    'choice',
                    isPicked ? 'picked' : '',
                    isKey ? 'is-key' : '',
                    isPicked && !isKey ? 'is-wrongpick' : '',
                  ].filter(Boolean).join(' ')}>
                <div className="choice-main">
                  <span className="bubble">{option.label}</span>
                  <RichText className="choice-text" html={option.html}
                            field={`option:${option.label}`} annotations={data.annotations} />
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}

      {data.annotations.length ? (
        <p className="review-anns">
          <Icon name="highlighter" size={14} />
          Your highlights are shown above.
        </p>
      ) : null}

      {/* Marked but never answered: no attempts, no verdict. Inside a set the
          table is every attempt anywhere, so it says so and marks the set's. */}
      {showAttempts ? (<>
      <h4 className="review-h">{setWindow ? 'All your attempts at this question' : 'Your attempts'}</h4>
      <div className="review-tablewrap">
        <table className="review-table">
          <thead>
            <tr><th>#</th><th>When</th><th>Answer</th><th>Result</th><th>Time</th></tr>
          </thead>
          <tbody>
            {attempts.map((a, i) => (
              <tr key={a.id ?? i} className={i === setAttempt ? 'is-set' : undefined}>
                <td>{i + 1}</td>
                <td>
                  {clock(a.answered_at)}
                  {i === setAttempt ? <span className="badge review-setbadge">This set</span> : null}
                </td>
                <td className="review-ans">{a.response || VERDICT.unanswered}</td>
                <td className={a.correct ? 'ok' : 'no'}>{a.correct ? VERDICT.correct : VERDICT.incorrect}</td>
                <td>{duration(a.seconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>) : null}

      {regraded ? (
        <p className="review-regrade">
          <Icon name="info" size={14} />
          Re-graded against the current answer key.
        </p>
      ) : null}

      <Explanation result={result} question={data.question}
                   seconds={seconds} startOpen hideToggle unanswered={!attempts.length} />

      {/* After the explanation: why you missed it comes once you have read
          why the answer is what it is. Editable on a miss, read-only
          elsewhere. Nothing logged and nothing to log with means nothing to
          show: an empty section was just noise on every question you never
          wrote anything about. */}
      {editable ? (
        <>
          {/* Opens like the passage above it. The label carries whether there
              is already something logged, so a folded section never hides the
              fact that you wrote one. */}
          <button className="btn small review-toggle mlog-toggle"
                  aria-expanded={showLog}
                  onClick={() => setShowLog((v) => !v)}>
            {hasLog ? 'Your mistake log' : 'Log this mistake'}
            <Icon name={showLog ? 'chevron-up' : 'chevron-down'}
                  size={14} strokeWidth={2.2} />
          </button>
          {showLog ? (
            <div className="mlog mlog-inline">
              <MistakeFields mistake={data.mistake}
                             onSave={saveMistake}
                             id={`mlog-note-${id}`}
                             lead="Why did you miss this one?"
                             // Review is the page it shows up on; there, say nothing more.
                             fine={`Saved automatically.${setWindow ? ' Shows up on the Review page.' : ''}`} />
              {logError ? <p className="mlog-error">{logError}</p> : null}
            </div>
          ) : null}
        </>
      ) : hasLog ? (
        <>
          <h4 className="review-h">Mistake log</h4>
          <div className="review-mistake">
            {data.mistake!.tags.length ? (
              <div className="chips">
                {data.mistake!.tags.map((t) => (
                  <span key={t} className="chip on static">{TAG_LABEL[t]}</span>
                ))}
              </div>
            ) : null}
            {data.mistake!.note ? (
              <p className="review-note">{data.mistake!.note}</p>
            ) : null}
          </div>
        </>
      ) : null}

      {similar && similar.ids.length > 0 && onPracticeMany ? (
        <div className="similar">
          <span className="similar-k">Same type</span>
          <span className="similar-t">{similar.type?.label ?? data.question.skill_name}</span>
          {similar.type ? <span className="similar-how">{similar.type.how}</span> : null}
          <button className="btn primary similar-go"
                  onClick={() => onPracticeMany(similar.ids,
                    `Similar: ${similar.type?.label ?? data.question.skill_name}`)}>
            Practice {similar.ids.length} similar
            <Icon name="arrow-right" size={15} strokeWidth={2.4} />
          </button>
        </div>
      ) : null}

      <button className="btn small review-again" onClick={() => onPractice(id)}>
        Practice this question again
        <Icon name="arrow-right" size={14} strokeWidth={2.2} />
      </button>
    </div>
  )
}

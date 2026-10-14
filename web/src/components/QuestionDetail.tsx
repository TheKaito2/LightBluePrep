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
import { VERDICT, plural } from '../lib/labels'
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
}

export function QuestionDetail({
  id, response, seconds, onPractice, onLogged, editable, onPracticeMany,
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
        onLogged?.(id, q.mistake ? q.mistake.tags : null)
      })
      .catch((e: Error) => !stale && setError(toUserMessage(e)))
    return () => { stale = true }
  }, [id, response, onLogged])

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
  if (!data || !result) return <p className="review-empty">Loading…</p>

  const hasLog = Boolean(data.mistake
    && (data.mistake.tags.length || data.mistake.note))

  function saveMistake(tags: MistakeTag[], note: string | null) {
    setLogError(null)
    void api.saveMistake(id, tags, note)
      .then((r) => {
        setData((d) => (d ? { ...d, mistake: r.mistake } : d))
        onLogged?.(id, r.mistake && (r.mistake.tags.length || r.mistake.note)
          ? r.mistake.tags : null)
      })
      .catch((e: Error) => setLogError(toUserMessage(e)))
  }

  return (
    <div className="review-detail">
      {/* The passage is the longest thing here and you usually remember it, so
          it starts folded and the question stays at the top of the panel. */}
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
              <RichText html={data.question.stimulus_html} field="stimulus" annotations={[]} />
            </div>
          ) : null}
        </>
      ) : null}

      <div className="review-stem">
        <RichText html={data.question.stem_html} field="stem" annotations={[]} />
      </div>

      {/* The explanation below talks about the choices by letter, so without
          the choices themselves "Why B is wrong" says nothing. Same markup and
          the same three colours practice uses once you have answered: green is
          the key, red is a wrong pick, the blue ring is what you chose. */}
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
                            field={`option:${option.label}`} annotations={[]} />
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}

      {/* Marked but never answered: no attempts, no verdict. */}
      {attempts.length ? (<>
      <h4 className="review-h">Your attempts</h4>
      <div className="review-tablewrap">
        <table className="review-table">
          <thead>
            <tr><th>#</th><th>When</th><th>Answer</th><th>Result</th><th>Time</th></tr>
          </thead>
          <tbody>
            {attempts.map((a, i) => (
              <tr key={a.id ?? i}>
                <td>{i + 1}</td>
                <td>{clock(a.answered_at)}</td>
                <td className="review-ans">{a.response || VERDICT.unanswered}</td>
                <td className={a.correct ? 'ok' : 'no'}>{a.correct ? VERDICT.correct : VERDICT.incorrect}</td>
                <td>{duration(a.seconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>) : null}

      {/* Editable where the verdict has just been revealed, read-only
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
            Mistake Logging
            {hasLog ? ` (${data.mistake!.tags.length || 1})` : ''}
            <Icon name={showLog ? 'chevron-up' : 'chevron-down'}
                  size={14} strokeWidth={2.2} />
          </button>
          {showLog ? (
            <div className="mlog mlog-inline">
              <MistakeFields mistake={data.mistake}
                             onSave={saveMistake}
                             id={`mlog-note-${id}`}
                             lead="Why did you miss this one? Pick as many as fit." />
              <p className="mlog-fine">
                Saved automatically. Shows up on the Review page.
              </p>
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

      {data.annotations.length ? (
        <p className="review-anns">
          {plural(data.annotations.length, 'highlight')} saved on this question.
        </p>
      ) : null}

      <Explanation result={result} question={data.question}
                   seconds={seconds} startOpen unanswered={!attempts.length} />

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

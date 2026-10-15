import { useEffect, useRef, useState, type ReactNode } from 'react'
import { RichText } from './RichText'
import { Explanation } from './Explanation'
import { BookmarkFilled, Icon, SplitHandle } from './Icon'
import { FeedbackLink } from './Feedback'
import { MistakeFields } from './MistakeFields'
import type { Annotation, GradeResult, Mistake, MistakeTag, Question } from '../types'

/**
 * Below this the two panes stack instead of sitting side by side.
 *
 * Measured, not guessed: at 390px the split gave a 195px passage column and a
 * 191px question column, which puts answer choices at two or three words a line
 * and made single choices over 900px tall. It has to match the breakpoint in
 * styles/bluebook.css.
 */
const STACK_BELOW = 820

function useStacked(): boolean {
  const query = `(max-width: ${STACK_BELOW - 1}px)`
  const [stacked, setStacked] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setStacked(mq.matches)
    // No immediate onChange(): useState already read matchMedia, and calling it
    // here just forces a second render on every mount.
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return stacked
}

interface Props {
  question: Question
  number: number
  annotations: Annotation[]
  result: GradeResult | null
  seconds: number
  response: string | null
  flagged: boolean
  crossOutMode: boolean
  crossOut: Set<string>
  onRespond: (value: string | null) => void
  onSubmit: () => void
  onToggleFlag: () => void
  onToggleCrossOutMode: () => void
  onToggleCrossOut: (label: string) => void
  onAddAnnotation: (a: Omit<Annotation, 'id'>) => void
  onRemoveAnnotation: (id: number) => void
  /**
   * Inside a practice set. Your answer is held and graded when the set ends,
   * so there is nothing to submit and nothing to read here: no verdict, no
   * explanation, and the choices stay live so you can change your mind.
   */
  deferred?: boolean
  /** Why you missed it. Asked inline, and only after a wrong answer. */
  mistake: Mistake | null
  onSaveMistake: (tags: MistakeTag[], note: string | null) => void | Promise<unknown>
  /** The one-time first-question tip, shown just above the choices. */
  coach?: ReactNode
}

interface PendingSelection {
  field: string
  start: number
  end: number
  x: number
  y: number
}

const COLORS = ['yellow', 'blue', 'pink'] as const

export function QuestionView(props: Props) {
  const {
    question, number, annotations, result, seconds, response, flagged,
    crossOutMode, crossOut, onRespond, onSubmit, onToggleFlag,
    onToggleCrossOutMode, onToggleCrossOut, onAddAnnotation, onRemoveAnnotation,
    deferred, mistake, onSaveMistake, coach,
  } = props

  const [pending, setPending] = useState<PendingSelection | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [split, setSplit] = useState(50)
  const stacked = useStacked()
  const dragging = useRef(false)

  const answered = result !== null
  // Graded right here, as open practice is. A set holds its answers until the
  // end, so inside one nothing is graded and the choices stay live.
  const graded = answered && !deferred
  // Grading turns the cross-out tool off for this question: the column and the
  // ABC key go together, so the choices change width once and on purpose rather
  // than leaving a faded key with nothing to act on.
  const crossing = crossOutMode && !graded
  const hasStimulus = Boolean(question.stimulus_html?.trim())
  const isSplit = hasStimulus && question.section === 'RW'

  useEffect(() => { setPending(null); setNoteDraft('') }, [question.id])

  /**
   * Dismiss the highlight menu as soon as you interact anywhere else.
   *
   * It used to persist until you committed or hit the explicit cancel, so
   * clicking away left it stranded over the passage. Pointer-down is the right
   * signal: it fires when you click off AND when you start dragging a new
   * selection, and it precedes the mouseup that would open the next menu.
   *
   * Clicks inside the menu are exempt, otherwise focusing the note input would
   * close the very menu it belongs to.
   */
  useEffect(() => {
    if (!pending) return
    function dismiss() { setPending(null); setNoteDraft('') }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null
      if (target?.closest?.('.hl-menu')) return
      dismiss()
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') dismiss()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [pending])

  useEffect(() => {
    function move(event: MouseEvent) {
      if (!dragging.current) return
      setSplit(Math.min(72, Math.max(28, (event.clientX / window.innerWidth) * 100)))
    }
    function up() { dragging.current = false; document.body.classList.remove('dragging') }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [])

  function startDrag() {
    dragging.current = true
    document.body.classList.add('dragging')
  }

  function handleSelect(range: { field: string; start: number; end: number }) {
    const selection = window.getSelection()
    const rect = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null
    setPending({
      ...range,
      x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
      y: rect ? rect.top : 120,
    })
    setNoteDraft('')
  }

  function commit(color: string) {
    if (!pending) return
    onAddAnnotation({
      field: pending.field,
      start_offset: pending.start,
      end_offset: pending.end,
      color,
      note: noteDraft.trim() || null,
    })
    window.getSelection()?.removeAllRanges()
    setPending(null)
    setNoteDraft('')
  }

  const stimulus = hasStimulus ? (
    <RichText className="passage" html={question.stimulus_html} field="stimulus"
              annotations={annotations} onSelect={handleSelect}
              onAnnotationClick={onRemoveAnnotation} />
  ) : null

  const prompt = (
    <div className="prompt">
      {hasStimulus && !isSplit ? <div className="figure">{stimulus}</div> : null}

      <div className={flagged ? 'q-head is-marked' : 'q-head'}>
        <span className="q-num">{number}</span>
        <button className={flagged ? 'markbtn on' : 'markbtn'} onClick={onToggleFlag}>
          {flagged ? <BookmarkFilled size={17} /> : <Icon name="bookmark" size={17} />}
          <span>{flagged ? 'Marked for Review' : 'Mark for Review'}</span>
        </button>

        {/* ID, difficulty and band live behind Info in the top bar. */}
        <span className="q-head-spacer" />

        {question.type === 'mcq' && !graded ? (
          <button className={crossOutMode ? 'strike on' : 'strike'}
                  onClick={onToggleCrossOutMode}
                  aria-pressed={crossOutMode}
                  title="Cross out answer choices">
            <span className="strike-letters">ABC</span>
          </button>
        ) : null}
      </div>

      <RichText className="stem" html={question.stem_html} field="stem"
                annotations={annotations} onSelect={handleSelect}
                onAnnotationClick={onRemoveAnnotation} />

      {coach}

      {question.type === 'mcq' && question.options ? (
        <ul className="choices">
          {question.options.map((option) => {
            // A crossed-out key would otherwise grade as faded and struck through.
            const isCrossed = crossOut.has(option.label) && !graded
            const isPicked = response === option.label
            const isKey = graded && result!.accepted.includes(option.label)
            const isWrongPick = graded && isPicked && !result!.correct
            return (
              <li key={option.label}
                  className={[
                    'choice',
                    // Once graded the state edge says it all; the blue selection
                    // ring around a red or green edge read as a glitch.
                    isPicked && !graded ? 'picked' : '',
                    isCrossed ? 'crossed' : '',
                    isKey ? 'is-key' : '',
                    isWrongPick ? 'is-wrongpick' : '',
                  ].filter(Boolean).join(' ')}>
                <button className="choice-main"
                        disabled={graded || isCrossed}
                        onClick={() => onRespond(option.label)}>
                  {/* The mark is the non-colour tell for right and wrong. */}
                  <span className="bubble">
                    {option.label}
                    {isKey || isWrongPick ? (
                      <span className="bubble-mark" aria-hidden="true">
                        <Icon name={isKey ? 'check' : 'close'} size={10} strokeWidth={3.2} />
                      </span>
                    ) : null}
                  </span>
                  <RichText className="choice-text" html={option.html}
                            field={`option:${option.label}`} annotations={annotations} />
                  {isKey ? <span className="sr-only">, correct answer</span>
                    : isWrongPick ? <span className="sr-only">, your answer, incorrect</span> : null}
                </button>
                {crossing ? (
                  <button className={isCrossed ? 'crossbtn on' : 'crossbtn'}
                          title={isCrossed ? 'Undo cross out' : `Cross out ${option.label}`}
                          onClick={() => onToggleCrossOut(option.label)}>
                    {option.label}
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="spr">
          <label htmlFor="spr-input">Enter your answer</label>
          <input id="spr-input"
                 className={graded ? `spr-input ${result!.correct ? 'is-right' : 'is-wrong'}` : 'spr-input'}
                 value={response ?? ''}
                 disabled={graded} autoComplete="off" placeholder="—"
                 onChange={(e) => onRespond(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter' && response && !deferred) onSubmit() }} />
        </div>
      )}

      {deferred ? null : !answered ? (
        <button className="btn primary submit" disabled={!response} onClick={onSubmit}>
          Submit answer
        </button>
      ) : (
        <Explanation result={result!} question={question} seconds={seconds} autoFocus />
      )}

      {/* Only when it went wrong: a log on a right answer is noise. Keyed so a
          new question starts blank rather than inheriting the last one's text. */}
      {graded && !result!.correct ? (
        <section className="mlog-practice" aria-label="Mistake log">
          <MistakeFields key={question.id} mistake={mistake} onSave={onSaveMistake}
                         lead="Why did you miss it?" id="mlog-inline" rows={3}
                         fine="Saved automatically to your mistake log on Review." />
        </section>
      ) : null}

      <FeedbackLink label="Report a problem with this question" className="fb-link q-report"
                    ctx={{ question_id: question.id, cb_id: question.cb_id, context: 'question', kind: 'bug' }} />
    </div>
  )

  // Always rendered, so the verdict is a change to a live region that is
  // already there: a region that mounts with its text is often not announced.
  const status = !graded ? ''
    : result!.correct ? 'Correct'
      : `Incorrect. The correct answer is ${result!.accepted.join(' or ')}.`

  return (
    <div className="qview">
      <p className="sr-only" role="status">{status}</p>
      {isSplit && stacked ? (
        // No inline grid-template-columns and no divider: the columns are a
        // desktop affordance, and a 4px drag handle is not usable by thumb.
        // Leaving the inline style on would beat any media query anyway.
        <div className="split stacked">
          <div className="pane pane-stimulus">{stimulus}</div>
          <div className="pane">{prompt}</div>
        </div>
      ) : isSplit ? (
        <div className="split" style={{ gridTemplateColumns: `${split}% 4px 1fr` }}>
          <div className="pane">{stimulus}</div>
          <div className="divider" onMouseDown={startDrag}>
            <span className="grab" onMouseDown={startDrag}>
              <SplitHandle />
            </span>
          </div>
          <div className="pane">{prompt}</div>
        </div>
      ) : (
        <div className="single"><div className="pane">{prompt}</div></div>
      )}

      {pending ? (
        <div className="hl-menu"
             style={{
               left: Math.min(window.innerWidth - 190, Math.max(190, pending.x)),
               top: Math.max(58, pending.y - 12),
             }}>
          {COLORS.map((color) => (
            <button key={color} className={`swatch sw-${color}`}
                    title={`Highlight ${color}`} onClick={() => commit(color)} />
          ))}
          <button className="hl-icon" title="Underline" onClick={() => commit('underline')}>
            <Icon name="underline" size={16} />
          </button>
          <span className="hl-sep" />
          {/* 1000 is what the sync Worker keeps; longer would be cut silently. */}
          <input className="hl-note-input" placeholder="Add a note" value={noteDraft} maxLength={1000}
                 onChange={(e) => setNoteDraft(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter') commit('yellow') }} />
          <button className="hl-icon" title="Cancel"
                  onClick={() => { setPending(null); setNoteDraft('') }}>
            <Icon name="close" size={16} />
          </button>
        </div>
      ) : null}
    </div>
  )
}

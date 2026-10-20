import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { RichText } from './RichText'
import { Explanation } from './Explanation'
import { BookmarkFilled, Icon, SplitHandle } from './Icon'
import { FeedbackLink } from './Feedback'
import { MistakeFields } from './MistakeFields'
import { SprRules } from './Directions'
import { parseRational } from '../lib/fraction'
import { tooFewDigits } from '../lib/grading'
import { VERDICT } from '../lib/labels'
import { useStacked } from '../lib/useStacked'
import type { Annotation, GradeResult, Mistake, MistakeTag, Question } from '../types'

interface Props {
  question: Question
  number: number
  annotations: Annotation[]
  result: GradeResult | null
  /** Wrong, and the key not shown yet: offer Try again or Show answer. */
  masked?: boolean
  /** The saved first try was wrong, so the mistake log stays after a retry. */
  missed?: boolean
  onTryAgain?: () => void
  onShowAnswer?: () => void
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
  onUpdateAnnotation: (id: number, patch: Pick<Annotation, 'color' | 'note'>) => void
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

/** What the highlight menu is anchored on, in viewport pixels. */
interface Anchor {
  x: number
  top: number
  bottom: number
}

/** A new selection to highlight, or an existing highlight to edit. */
type HighlightMenu =
  | ({ mode: 'new'; field: string; start: number; end: number } & Anchor)
  | ({ mode: 'edit'; id: number } & Anchor)

const COLORS = ['yellow', 'blue', 'pink'] as const

/** The passage divider's range and step, in percent of the split's width. */
const SPLIT_MIN = 28
const SPLIT_MAX = 72
const SPLIT_STEP = 4
const clampSplit = (pct: number) => Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, pct))
/**
 * Where you last left the divider. A module variable because QuestionView
 * remounts on every question, and a split that snapped back to 50% each time
 * was a split you had to drag again on every passage. It lasts the session.
 */
let savedSplit = 50

/** What a grid-in accepts, as Bluebook's field does; SprRules says it in words. */
const SPR_CHARS = /^[-0-9./]*$/
const sprLimit = (value: string) => (value.startsWith('-') ? 6 : 5)

/** The typed answer as it will be read: a fraction stacks, a minus is a real minus. */
function sprPreview(value: string): ReactNode {
  const negative = value.startsWith('-')
  const body = negative ? value.slice(1) : value
  const slash = body.indexOf('/')
  const sign = negative ? '−' : ''
  if (slash <= 0 || !parseRational(value)) return sign + body
  return (
    <>
      {sign}
      <span className="frac">
        <span className="frac-num">{body.slice(0, slash)}</span>
        <span className="frac-den">{body.slice(slash + 1)}</span>
      </span>
    </>
  )
}

function anchorOf(rect: DOMRect | null): Anchor {
  return rect
    ? { x: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom }
    : { x: window.innerWidth / 2, top: 120, bottom: 120 }
}

export function QuestionView(props: Props) {
  const {
    question, number, annotations, result, seconds, response, flagged,
    crossOutMode, crossOut, onRespond, onSubmit, onToggleFlag,
    onToggleCrossOutMode, onToggleCrossOut, onAddAnnotation, onUpdateAnnotation, onRemoveAnnotation,
    deferred, mistake, onSaveMistake, coach, masked = false, missed, onTryAgain, onShowAnswer,
  } = props

  const [menu, setMenu] = useState<HighlightMenu | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [pickedColor, setPickedColor] = useState('yellow')
  const [menuPlace, setMenuPlace] = useState<CSSProperties>({})
  const menuRef = useRef<HTMLDivElement>(null)
  const [split, setSplitState] = useState(savedSplit)
  const setSplit = (pct: number) => { savedSplit = clampSplit(pct); setSplitState(savedSplit) }
  const stacked = useStacked()
  // Phone passage: capped at 40dvh (bluebook.css) with a toggle to open it in
  // full. Tall is measured against the cap itself, so the 40dvh lives in CSS.
  const capRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const [passageTall, setPassageTall] = useState(false)
  const [passageOpen, setPassageOpen] = useState(false)

  // Graded right here, as open practice is. A set holds its answers until the
  // end, so inside one nothing is graded and the choices stay live.
  const verdict = deferred ? null : result
  const graded = verdict !== null
  // Grading turns the cross-out tool off for this question: the column and the
  // ABC key go together, so the choices change width once and on purpose rather
  // than leaving a faded key with nothing to act on.
  const crossing = crossOutMode && !graded
  const hasStimulus = Boolean(question.stimulus_html?.trim())
  const isSplit = hasStimulus && question.section === 'RW'

  // oxlint-disable-next-line react/set-state-in-effect -- resets on a new question
  useEffect(() => { setMenu(null) }, [question.id])

  /**
   * Whether the stacked passage overflows its cap. Re-measured when the cap
   * changes size (rotation, the browser bar) and when the passage does (fonts,
   * MathJax, images). Not while open: there is no cap to overflow then, and
   * the toggle has to stay to close it again.
   */
  useLayoutEffect(() => {
    const el = capRef.current
    if (!el || passageOpen) return
    const measure = () => setPassageTall(el.scrollHeight > el.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    return () => observer.disconnect()
  }, [passageOpen, stacked, isSplit])

  function togglePassage() {
    setPassageOpen((open) => !open)
    // Closing a long passage from its end would leave you far below the
    // question it just pulled up; bring the toggle back into view instead.
    if (passageOpen) requestAnimationFrame(() => toggleRef.current?.scrollIntoView({ block: 'nearest' }))
  }

  /**
   * Dismiss the highlight menu as soon as you interact anywhere else, so it is
   * never left stranded over the passage. Pointer-down is the right signal: it
   * fires when you click off AND when you start dragging a new selection, and
   * it precedes the mouseup that would open the next menu.
   *
   * Clicks inside the menu are exempt, otherwise focusing the note input would
   * close the very menu it belongs to.
   */
  useEffect(() => {
    if (!menu) return
    function dismiss() { setMenu(null) }
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
  }, [menu])

  const menuOpen = menu !== null
  const menuMode = menu?.mode
  const menuId = menu?.mode === 'edit' ? menu.id : `${menu?.mode}`
  // Focus the first swatch when a menu opens, so a keyboard selection can go
  // straight on to choosing a colour. Not on every update of an open menu,
  // which would pull focus out of the note while you type.
  useEffect(() => {
    if (menuOpen) menuRef.current?.querySelector<HTMLElement>('.swatch')?.focus()
  }, [menuOpen, menuMode, menuId])

  /**
   * Place the menu by its measured size: above the selection when it fits
   * under the top bar, otherwise below it, and never off either side (it was
   * clamped for a fixed 380px, so a 360px phone lost its left edge). Under the
   * stacking breakpoint it docks as a bar just above the bottom bar instead,
   * clear of the phone's own selection callout.
   */
  const hasNote = noteDraft.trim() !== ''
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!menu || !el) return
    if (stacked) {
      const bar = document.querySelector('.bottombar')?.getBoundingClientRect()
      // oxlint-disable-next-line react/set-state-in-effect -- placed from measured layout, which exists only after commit
      setMenuPlace({ bottom: bar ? window.innerHeight - bar.top + 8 : 8 })
      return
    }
    const { width, height } = el.getBoundingClientRect()
    const floor = (document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0) + 8
    const above = menu.top - 12 - height
    const top = above >= floor
      ? above
      : Math.max(floor, Math.min(menu.bottom + 12, window.innerHeight - height - 8))
    const left = Math.min(window.innerWidth - width / 2 - 8, Math.max(width / 2 + 8, menu.x))
    setMenuPlace({ left, top })
  }, [menu, stacked, hasNote])

  /**
   * Drag the divider with any pointer. Capture keeps the moves coming when the
   * pointer runs over the passage or leaves the window mid-drag.
   */
  function onDividerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    document.body.classList.add('dragging')
  }
  function onDividerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const box = event.currentTarget.parentElement?.getBoundingClientRect()
    if (!box) return
    setSplit(((event.clientX - box.left) / box.width) * 100)
  }
  function onDividerUp(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.releasePointerCapture(event.pointerId)
    document.body.classList.remove('dragging')
  }
  function onDividerKey(event: React.KeyboardEvent) {
    const next = event.key === 'ArrowLeft' ? split - SPLIT_STEP
      : event.key === 'ArrowRight' ? split + SPLIT_STEP
        : event.key === 'Home' ? SPLIT_MIN
          : event.key === 'End' ? SPLIT_MAX : null
    if (next === null) return
    // The arrows change the question everywhere else on this screen.
    event.preventDefault()
    event.stopPropagation()
    setSplit(next)
  }

  function handleSelect(range: { field: string; start: number; end: number }) {
    // Already open on exactly this selection: keep the note being written.
    if (menu?.mode === 'new' && menu.field === range.field
        && menu.start === range.start && menu.end === range.end) return
    const selection = window.getSelection()
    const rect = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null
    setMenu({ mode: 'new', ...range, ...anchorOf(rect) })
    setNoteDraft('')
    setPickedColor('yellow')
  }

  /**
   * A click on a highlight opens it for editing, never deletes it: the click
   * may only be the start of a new selection, and a note can go with it.
   * Removing takes the menu's own trash button.
   */
  function handleAnnotationClick(id: number, rect: DOMRect) {
    const annotation = annotations.find((a) => a.id === id)
    if (!annotation) return
    setMenu({ mode: 'edit', id, ...anchorOf(rect) })
    setNoteDraft(annotation.note ?? '')
    setPickedColor(annotation.color)
  }

  function commit(color: string) {
    if (!menu) return
    const note = noteDraft.trim() || null
    if (menu.mode === 'edit') {
      onUpdateAnnotation(menu.id, { color, note })
    } else {
      onAddAnnotation({ field: menu.field, start_offset: menu.start, end_offset: menu.end, color, note })
      window.getSelection()?.removeAllRanges()
    }
    setMenu(null)
  }

  /**
   * One click highlights when there is no note, as before. With a note written,
   * a colour only picks: the note is saved with Enter or Save, in whichever
   * colour is picked, so the order you do them in no longer matters.
   */
  function pick(color: string) {
    setPickedColor(color)
    if (!hasNote) commit(color)
  }

  function removeEdited() {
    if (menu?.mode !== 'edit') return
    onRemoveAnnotation(menu.id)
    setMenu(null)
  }

  const stimulus = hasStimulus ? (
    <RichText className="passage" html={question.stimulus_html} field="stimulus"
              annotations={annotations} onSelect={handleSelect}
              onAnnotationClick={handleAnnotationClick} />
  ) : null

  const prompt = (
    <div className="prompt">
      <div className={flagged ? 'q-head is-marked' : 'q-head'}>
        <h2 className="q-num"><span className="sr-only">Question </span>{number}</h2>
        <button className={flagged ? 'markbtn on' : 'markbtn'} onClick={onToggleFlag}
                aria-pressed={flagged}>
          {flagged ? <BookmarkFilled size={17} /> : <Icon name="bookmark" size={17} />}
          <span>{flagged ? 'Marked for Review' : 'Mark for Review'}</span>
        </button>

        {/* ID, difficulty and band live behind Info in the top bar. */}
        <span className="q-head-spacer" />

        {question.type === 'mcq' && !graded ? (
          <button className={crossOutMode ? 'strike on' : 'strike'}
                  onClick={onToggleCrossOutMode}
                  aria-pressed={crossOutMode}
                  aria-label="Cross out answer choices"
                  title="Cross out answer choices">
            <span className="strike-letters">ABC</span>
          </button>
        ) : null}
      </div>

      {/* Under the question bar, as in Bluebook. */}
      {hasStimulus && !isSplit ? <div className="figure">{stimulus}</div> : null}

      <RichText className="stem" html={question.stem_html} field="stem"
                annotations={annotations} onSelect={handleSelect}
                onAnnotationClick={handleAnnotationClick} />

      {coach}

      {question.type === 'mcq' && question.options ? (
        <ul className="choices">
          {question.options.map((option) => {
            // A crossed-out key would otherwise grade as faded and struck through.
            const isCrossed = crossOut.has(option.label) && !graded
            const isPicked = response === option.label
            const isKey = graded && !masked && verdict.accepted.includes(option.label)
            const isWrongPick = graded && isPicked && !verdict.correct
            const crossLabel = isCrossed
              ? `Undo cross out of choice ${option.label}` : `Cross out choice ${option.label}`
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
                {/* Crossed stays focusable and clickable, as in Bluebook: picking a
                    crossed choice un-crosses it and selects it. */}
                <button className="choice-main"
                        disabled={graded}
                        aria-pressed={isPicked}
                        aria-disabled={isCrossed || undefined}
                        onClick={() => {
                          if (isCrossed) onToggleCrossOut(option.label)
                          onRespond(option.label)
                        }}>
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
                  {isCrossed ? <span className="sr-only"> (crossed out)</span> : null}
                </button>
                {crossing ? (
                  <button className={isCrossed ? 'crossbtn on' : 'crossbtn'}
                          aria-label={crossLabel}
                          aria-pressed={isCrossed}
                          title={crossLabel}
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
          {/* inputMode text, not decimal: iOS's decimal pad has no '/' or '-'. */}
          <input id="spr-input"
                 className={graded ? `spr-input ${verdict.correct ? 'is-right' : 'is-wrong'}` : 'spr-input'}
                 value={response ?? ''}
                 disabled={graded} autoComplete="off"
                 maxLength={sprLimit(response ?? '')}
                 inputMode="text" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                 enterKeyHint="done" aria-describedby="spr-rules"
                 onChange={(e) => {
                   const value = e.target.value
                   if (SPR_CHARS.test(value) && value.length <= sprLimit(value)) onRespond(value)
                 }}
                 // preventDefault: a retry grades at once, and the same Enter
                 // would otherwise press the button that takes focus.
                 onKeyDown={(e) => { if (e.key === 'Enter' && response && !deferred) { e.preventDefault(); onSubmit() } }} />
          {/* The field already holds the same text for a screen reader. */}
          <p className="spr-preview" aria-hidden="true">
            <span className="spr-preview-label">Answer preview:</span>
            <span className="spr-preview-value">{sprPreview(response ?? '')}</span>
          </p>
          {graded && !verdict.correct && tooFewDigits(verdict.response, verdict.accepted) ? (
            <p className="spr-short">
              Close, but too few digits. Fill every space: 5 characters, or 6 with a minus sign.
              A leading zero uses one up, so leave it off.
            </p>
          ) : null}
          <details className="spr-help">
            <summary><Icon name="chevron-down" size={15} />How to enter answers</summary>
            <SprRules id="spr-rules" />
          </details>
        </div>
      )}

      {deferred ? null : !verdict ? (
        <button className="btn primary submit" disabled={!response} onClick={onSubmit}>
          Submit answer
        </button>
      ) : masked ? (
        <div className="explain-bar retry-bar">
          <span className="badge verdict bad">
            <Icon name="close" size={12} strokeWidth={2.8} />{VERDICT.incorrect}
          </span>
          {/* Focus moves here as Submit unmounts, as it does to Explain. */}
          <button className="btn primary" autoFocus onClick={onTryAgain}>Try again</button>
          <button className="btn" onClick={onShowAnswer}>Show answer</button>
        </div>
      ) : (
        <Explanation result={verdict} question={question} seconds={seconds} autoFocus />
      )}

      {/* Only when it went wrong: a log on a right answer is noise. Keyed so a
          new question starts blank rather than inheriting the last one's text. */}
      {graded && (missed ?? !verdict.correct) ? (
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
    : verdict.correct ? 'Correct'
      : masked ? 'Incorrect. Try again, or show the answer.'
      : `Incorrect. The correct answer is ${verdict.accepted.join(' or ')}.`

  return (
    <div className="qview">
      <p className="sr-only" role="status">{status}</p>
      {isSplit && stacked ? (
        // No inline grid-template-columns and no divider: the columns are a
        // desktop affordance, and a 4px drag handle is not usable by thumb.
        // Leaving the inline style on would beat any media query anyway.
        // A passage taller than 40dvh pushed the question below the fold, so
        // answering changed nothing you could see. Bluebook has no phone
        // layout; its passage pane scrolls on its own, as the capped one does.
        <div className="split stacked">
          <section className={passageTall ? 'pane pane-stimulus has-toggle' : 'pane pane-stimulus'}
                   aria-label="Passage">
            {/* Focusable while it scrolls on its own, as the desktop pane is. */}
            <div ref={capRef} id="passage-cap" className={passageOpen ? 'passage-cap' : 'passage-cap is-capped'}
                 tabIndex={passageTall && !passageOpen ? 0 : undefined}>
              {stimulus}
            </div>
            {passageTall ? (
              <button ref={toggleRef} type="button" className="passage-toggle"
                      aria-expanded={passageOpen} aria-controls="passage-cap" onClick={togglePassage}>
                {passageOpen ? 'Show less' : 'Show full passage'}
                <Icon name={passageOpen ? 'chevron-up' : 'chevron-down'} size={16} strokeWidth={2.2} />
              </button>
            ) : null}
          </section>
          <div className="pane">{prompt}</div>
        </div>
      ) : isSplit ? (
        <div className="split" style={{ gridTemplateColumns: `${split}% 4px 1fr` }}>
          {/* Focusable because it scrolls on its own and may hold nothing
              else that takes focus: without a stop, a keyboard cannot reach
              the end of a long passage. */}
          <section className="pane" aria-label="Passage" tabIndex={0}>{stimulus}</section>
          <div className="divider" onPointerDown={onDividerDown} onPointerMove={onDividerMove}
               onPointerUp={onDividerUp} onPointerCancel={onDividerUp}
               onDoubleClick={() => setSplit(50)}>
            <div className="grab" role="separator" tabIndex={0} aria-orientation="vertical"
                 aria-valuenow={Math.round(split)} aria-valuemin={SPLIT_MIN} aria-valuemax={SPLIT_MAX}
                 aria-label="Resize passage and question" onKeyDown={onDividerKey}>
              <SplitHandle />
            </div>
          </div>
          <div className="pane">{prompt}</div>
        </div>
      ) : (
        <div className="single"><div className="pane">{prompt}</div></div>
      )}

      {menu ? (
        <div ref={menuRef} className={stacked ? 'hl-menu docked' : 'hl-menu'} style={menuPlace}
             role="group" aria-label={menu.mode === 'edit' ? 'Edit highlight' : 'Highlight'}>
          {COLORS.map((color) => (
            <button key={color} type="button"
                    className={pickedColor === color ? `swatch sw-${color} picked` : `swatch sw-${color}`}
                    aria-label={`Highlight ${color}`} title={`Highlight ${color}`}
                    aria-pressed={pickedColor === color} onClick={() => pick(color)} />
          ))}
          <button type="button" className={pickedColor === 'underline' ? 'hl-icon swatch-u picked' : 'hl-icon swatch-u'}
                  aria-label="Underline" title="Underline"
                  aria-pressed={pickedColor === 'underline'} onClick={() => pick('underline')}>
            <Icon name="underline" size={16} />
          </button>
          <span className="hl-sep" />
          {/* 1000 is what the sync Worker keeps; longer would be cut silently. */}
          <input className="hl-note-input" placeholder="Add a note" value={noteDraft} maxLength={1000}
                 aria-label="Note"
                 onChange={(e) => setNoteDraft(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter') commit(pickedColor) }} />
          <span className="hl-actions">
            {hasNote ? (
              <button type="button" className="hl-icon" aria-label="Save note" title="Save note"
                      onClick={() => commit(pickedColor)}>
                <Icon name="check" size={16} />
              </button>
            ) : null}
            {menu.mode === 'edit' ? (
              <button type="button" className="hl-icon hl-remove" aria-label="Remove highlight"
                      title="Remove highlight" onClick={removeEdited}>
                <Icon name="trash" size={16} />
              </button>
            ) : null}
            <button type="button" className="hl-icon" aria-label="Close" title="Close"
                    onClick={() => setMenu(null)}>
              <Icon name="close" size={16} />
            </button>
          </span>
        </div>
      ) : null}
    </div>
  )
}

/**
 * The practice screen, laid out as Bluebook has it: the section title, clock
 * and tools along the top, the question, and the navigator and Back / Next
 * along the bottom, with the dialogs that open over them.
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as api from '../api'
import { Directions, DIRECTIONS_ID } from './Directions'
import { ErrorBoundary } from './ErrorBoundary'
import { FeedbackHost } from './Feedback'
import { Icon } from './Icon'
import { Mark } from './Mark'
import { Navigator } from './Navigator'
import { Notes } from './Notes'
import { PracticeClock } from './PracticeClock'
import { QuestionInfo } from './QuestionInfo'
import { QuestionView } from './QuestionView'
import { SupportHost } from './Support'
import { useToast } from '../lib/toast'
import { SkipLink } from './TopNav'
import { DESMOS_EMBEDDED } from '../lib/desmos'
import { DIRECTIONS, SECTION_NAME } from '../lib/labels'
import { formatClock } from '../lib/pacing'
import { Desmos, ReferenceSheet, SetReview } from '../lib/pages'
import { titleFor, type View } from '../lib/route'
import { nextAnnotationId } from '../lib/ranges'
import { isBlank, nowSec, type CellState } from '../lib/sets'
import { COACH_KEY, getMeta, setMeta } from '../lib/store'
import { loadProcessTypes, similarTo, typeOf } from '../lib/similar'
import type { PracticeSetApi } from '../lib/usePracticeSet'
import { useQuestionTimer } from '../lib/useTimer'
import type { Annotation, Filters, GradeResult, Mistake, Question, SetItem, Stats } from '../types'

/**
 * How often a running set banks the time spent on the current question. This
 * is the most a reload can refund, so it wants to be short; it is also a write
 * each time, so it does not want to be every second.
 */
const SET_FLUSH_SECONDS = 5

/** Practice shortcuts, as Directions lists them. A set has no Enter: nothing is checked until the end. */
const KEYS_OPEN = 'Keyboard: ← → move, A–D choose, Enter check, M mark'
const KEYS_SET = 'Keyboard: ← → move, A–D choose, M mark'

/** What the practice back button names, by the page practice was opened over. */
const BACK_TO: Partial<Record<View, string>> = {
  review: 'Review', results: 'Results', stats: 'Stats', resources: 'Resources',
  about: 'About', settings: 'Settings', inbox: 'Inbox',
}

/**
 * Every question's cross-outs for this page load, so leaving a question and
 * coming back puts them back, as Bluebook does. Keyed by set as well as
 * question: redoing a set starts clean rather than inheriting the last try.
 */
const crossOuts = new Map<string, Set<string>>()

/**
 * Whether the one-time tip (H-31) has been considered yet: only the very first
 * question someone sees, judged by having no answers and no note that it was
 * shown. Checked once per page load.
 */
let coachChecked = false

/**
 * How many questions past the one on screen to warm. Fewer on a slow line,
 * where each extra fetch competes with the one you are waiting for.
 */
function prefetchAhead(): number {
  const type = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType
  return type === 'slow-2g' || type === '2g' || type === '3g' ? 2 : 3
}

/** The loading question's stem and four answer rows (styles/bluebook.css). */
const qskelChoices = (
  <>
    <span className="skel qskel-stem" />
    <span className="skel qskel-stem short" />
    {[0, 1, 2, 3].map((i) => <span key={i} className="skel qskel-choice" />)}
  </>
)

/**
 * One tool on the top bar: a toggle, or with `href` a link out. A phone shows
 * the glyphs alone, so `name` is what a screen reader hears when it says more
 * than the label.
 */
function Tool({ icon, label, on, onClick, href, count = 0, name, title, dialog }: {
  icon: ReactNode
  label: string
  on?: boolean
  onClick?: () => void
  href?: string
  count?: number
  name?: string
  title?: string
  dialog?: boolean
}) {
  const inner = (
    <>
      <span className="tool-glyphs">{icon}</span>
      {/* `has-count` so a phone can drop the label AND the wrapper when
          there is nothing left inside it. Hiding only the words leaves an
          empty flex item that still eats the row gap, which pushed the
          glyphs half a pixel off the bar's centre. */}
      <span className={count ? 'tool-label has-count' : 'tool-label'}>
        <span className="tool-text">{label}</span>
        {count ? ` (${count})` : ''}
      </span>
    </>
  )
  if (href) {
    return (
      <a className="tool" href={href} target="_blank" rel="noreferrer" aria-label={name ?? label} title={title}>
        {inner}
      </a>
    )
  }
  return (
    <button className={on ? 'tool on' : 'tool'} aria-label={name ?? label} aria-expanded={on}
            aria-haspopup={dialog ? 'dialog' : undefined} onClick={onClick}>
      {inner}
    </button>
  )
}

export function PracticeScreen({
  set, items, setItems, index, setIndex, filters, listTitle, oneFrom, practiceFrom, stats, onStats,
  banner, fail, navigate, practiceFilters, practiceMany,
}: {
  set: PracticeSetApi
  items: SetItem[]
  setItems: React.Dispatch<React.SetStateAction<SetItem[]>>
  index: number
  setIndex: (index: number) => void
  /** Home's picks, which name open practice and stand in for a section not loaded yet. */
  filters: Filters
  /** Title for a list opened from Review ("Review: Incorrect"). */
  listTitle: string | null
  /** Where a single question was opened from, so its footer can say "Back to Review". */
  oneFrom: View | null
  /** The page under practice, which is where its back button goes. */
  practiceFrom: View
  stats: Stats | null
  onStats: (stats: Stats) => void
  /** The app's error banner, if one is up. */
  banner: ReactNode
  fail: (e: unknown, retry?: () => void) => void
  navigate: (next: View) => void
  practiceFilters: (next: Filters) => void
  practiceMany: (ids: string[], title: string) => void
}) {
  const { activeSet, activeSetRef, remaining, commit, hold, setBank } = set
  const toast = useToast()
  const current = items[index] ?? null
  const crossKey = (id: string) => `${activeSetRef.current?.id ?? ''}:${id}`

  const [question, setQuestion] = useState<Question | null>(null)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [flagged, setFlagged] = useState(false)
  const [response, setResponse] = useState<string | null>(null)
  const [result, setResult] = useState<GradeResult | null>(null)
  const [crossOut, setCrossOut] = useState<Set<string>>(new Set())
  // Off by default, as on the real test: the strike column narrows every choice.
  const [crossOutMode, setCrossOutMode] = useState(false)
  const [showSetReview, setShowSetReview] = useState(false)
  const [showNavigator, setShowNavigator] = useState(false)
  // Stable, so the memoised Navigator skips the clock's re-renders.
  const closeNavigator = useCallback(() => setShowNavigator(false), [])
  const openReviewPage = useCallback(() => { setShowNavigator(false); setShowSetReview(true) }, [])
  const [showNotes, setShowNotes] = useState(false)
  const [showReference, setShowReference] = useState(false)
  const closeReference = useCallback(() => setShowReference(false), [])
  const [mistake, setMistake] = useState<Mistake | null>(null)
  const [showDirections, setShowDirections] = useState(false)
  const [showDesmos, setShowDesmos] = useState(false)
  const [desmosSplit, setDesmosSplit] = useState<number | null>(null)
  /** Bumped by Retry to re-run the question load. */
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((n) => n + 1), [])
  const [loading, setLoading] = useState(false)
  /**
   * Set once a question load has run past 250ms. Most loads come from the
   * prefetch cache well inside that, and flashing a placeholder for them made
   * the panes collapse and re-open on every Next (P-67).
   */
  const [slowLoad, setSlowLoad] = useState(false)

  const seconds = useQuestionTimer(current?.id ?? null, question !== null && result === null)

  /** The question the one-time tip is showing on, if any. */
  const [coachOn, setCoachOn] = useState<string | null>(null)
  useEffect(() => {
    if (!question || !stats || coachChecked) return
    coachChecked = true
    if (stats.attempts) return
    const id = question.id
    getMeta<boolean>(COACH_KEY).then((shown) => {
      if (shown) return
      setCoachOn(id)
      return setMeta(COACH_KEY, true)
    }).catch(() => { /* no storage: skip the tip rather than show it every visit */ })
  }, [question, stats])

  useEffect(() => {
    if (!current) { setQuestion(null); return }
    let stale = false
    setLoading(true); setSlowLoad(false)
    const slow = window.setTimeout(() => setSlowLoad(true), 250)
    // The old question goes at once rather than staying up until this one
    // lands: its response, cross-outs and highlights are already reset below.
    setQuestion(null); setResult(null)
    // Inside a set the answer is held rather than submitted, so coming back to
    // a question has to put the choice back.
    const held = activeSetRef.current?.items
      ?.find((i) => i.question_id === current.id)?.response ?? null
    setResponse(activeSetRef.current ? held : null)
    setCrossOut(new Set(crossOuts.get(crossKey(current.id)))); setAnnotations([])
    api.question(current.id)
      .then((d) => {
        if (stale) return
        setQuestion(d.question); setAnnotations(d.annotations); setFlagged(d.flagged)
        setMistake(d.mistake)
        // Once this one is on screen, so the warming never competes with it:
        // the next few in THIS list's order, and the one before for Back.
        api.prefetch([...items.slice(index + 1, index + 1 + prefetchAhead()), items[index - 1]]
          .flatMap((i) => (i ? [i.id] : [])))
      })
      .catch((e: Error) => !stale && fail(e, reload))
      .finally(() => {
        if (stale) return
        window.clearTimeout(slow)
        setLoading(false)
      })
    return () => { stale = true; window.clearTimeout(slow) }
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- keyed by question id: the list and the set change on every answer, which must not reload the question
  }, [current?.id, reloadKey, fail, reload])

  const go = useCallback((next: number) => {
    setIndex(Math.min(items.length - 1, Math.max(0, next)))
  }, [items.length, setIndex])

  // Leaving by browser Back banks the clock through this.
  useEffect(() => setBank(() => commit(seconds)), [setBank, commit, seconds])

  /**
   * Out of practice by the way it came in: Back to Home, Review or wherever the
   * entry practice pushed sits over. A deep link or a reload has nothing under
   * it, so that goes Home.
   */
  const leavePractice = useCallback(() => {
    // Bank the time on the question on screen before the set is dropped; the
    // interval flush only runs every few seconds.
    commit(seconds)
    // Every answer in a set is already saved as it is given; say so, or
    // leaving mid-set looks like throwing the set away.
    if (activeSetRef.current) toast('Set saved. Resume it from Practice.', { tone: 'ok' })
    if (history.state?.view === 'practice') history.back()
    else navigate('home')
  }, [commit, seconds, activeSetRef, navigate, toast])

  /**
   * Bank the clock as the set runs, not only when an answer is given.
   *
   * The set clock is the sum of the questions' own times, and those were only
   * written on answering. Time on a question you had not answered yet was
   * never written anywhere, so leaving and resuming refunded all of it: sit on
   * question one for ten minutes, reload, and the ten minutes came back.
   * Flushing on a short interval bounds what a reload can refund to the
   * interval itself, and costs one small write every few seconds.
   */
  useEffect(() => {
    if (!activeSet) return
    if (seconds <= 0 || seconds % SET_FLUSH_SECONDS !== 0) return
    commit(seconds)
  }, [seconds, activeSet, commit])

  async function submit() {
    // Inside a set nothing is submitted: answers are held and graded at the end.
    if (activeSetRef.current || !current || !response || result) return
    try {
      const graded = await api.answer(current.id, response, seconds)
      setResult(graded)
      setItems((prev) => prev.map((item) => (
        item.id === current.id
          ? {
              ...item,
              last_correct: graded.correct ? 1 : 0,
              last_seconds: seconds,
              last_response: response,
              answered_at: nowSec(),
              attempt_count: (item.attempt_count ?? 0) + 1,
            }
          : item
      )))
      api.stats().then(onStats).catch(() => {})
    } catch (e) { fail(e) }
  }

  async function toggleFlag() {
    if (!current) return
    const next = !flagged
    setFlagged(next)
    setItems((prev) => prev.map((i) => (i.id === current.id ? { ...i, flagged: next ? 1 : 0 } : i)))
    try { await api.flag(current.id, next) } catch (e) { fail(e) }
  }

  async function persistAnnotations(next: Annotation[]) {
    if (!current) return
    setAnnotations(next)
    try {
      const saved = await api.saveAnnotations(current.id, next)
      setAnnotations(saved.annotations)
    } catch (e) { fail(e) }
  }

  function updateAnnotation(id: number, patch: Pick<Annotation, 'color' | 'note'>) {
    void persistAnnotations(annotations.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }

  // Read by Undo, which runs up to 4s later against whatever is current then.
  const annotationsNow = useRef(annotations)
  const questionNow = useRef(current?.id)
  useEffect(() => {
    annotationsNow.current = annotations
    questionNow.current = current?.id
  })

  /** Remove at once, with an Undo, since a note can go with the highlight. */
  function removeAnnotation(id: number) {
    if (!current) return
    const questionId = current.id
    const removed = annotations.find((a) => a.id === id)
    if (!removed) return
    const rest = annotations.filter((a) => a.id !== id)
    void persistAnnotations(rest)
    toast(removed.note ? 'Highlight and note removed' : 'Highlight removed', {
      onUndo: () => {
        if (questionNow.current !== questionId) {
          // Moved on: nothing else can have changed that question since.
          api.saveAnnotations(questionId, [...rest, removed]).catch(fail)
          return
        }
        const now = annotationsNow.current
        // Its id may have been handed to a highlight made since; take a fresh one.
        const back = now.some((a) => a.id === removed.id) ? { ...removed, id: nextAnnotationId(now) } : removed
        void persistAnnotations([...now, back])
      },
    })
  }

  function toggleCrossOut(label: string) {
    if (!current) return
    const next = new Set(crossOut)
    if (next.has(label)) next.delete(label)
    else {
      next.add(label)
      // Crossing out your answer withdraws it. In a set the held copy has to go
      // too, or it comes back on return and is graded at the end.
      if (response === label) {
        setResponse(null)
        if (activeSetRef.current) hold(null, seconds)
      }
    }
    crossOuts.set(crossKey(current.id), next)
    setCrossOut(next)
  }

  /** An answer from a click or a key. A set holds it until the end. */
  function respond(value: string | null) {
    setResponse(value)
    if (activeSet) hold(value, seconds)
  }

  /**
   * Practice shortcuts. Rebuilt every render so it reads this render's answer
   * and question, and called through a ref so the window listener is added
   * once rather than on every tick of the clock.
   */
  const onPracticeKey = useRef<(event: KeyboardEvent) => void>(() => {})
  useEffect(() => {
    onPracticeKey.current = (event) => {
      const target = event.target as HTMLElement | null
      // Cmd/Ctrl/Alt+Arrow is the browser's back or line start, not Next.
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return
      // A Feedback or Support dialog sits over the question; keys belong to it.
      if (document.querySelector('.modal')) return
      // Shift+Arrow extends a text selection to highlight. Arrows inside the
      // highlight menu, a wide table, the passage divider or the calculator
      // scroll or move that thing; none of them should change the question.
      if (event.shiftKey
          || target?.closest?.('.hl-menu, .tablewrap, [role=separator], .desmos-panel')) return
      if (event.key === 'Escape') {
        setShowNavigator(false); setShowDesmos(false); setShowDirections(false)
        setShowNotes(false); setShowSetReview(false); setShowReference(false)
        return
      }
      // The navigator, Notes, Directions or the review page is open: the
      // question behind it stays put.
      if (document.querySelector('[aria-modal="true"]')) return
      if (event.key === 'ArrowLeft') { go(index - 1); return }
      if (event.key === 'ArrowRight') {
        // The last question of a set has Review where Next was; so does the key.
        if (activeSet && index >= items.length - 1) setShowSetReview(true)
        else go(index + 1)
        return
      }
      if (!question || !current) return
      const key = event.key.toLowerCase()
      if (key === 'm') { void toggleFlag(); return }
      const graded = result !== null && !activeSet
      if (question.type === 'mcq' && !graded && /^[a-d]$/.test(key)) {
        const label = key.toUpperCase()
        if (!question.options?.some((o) => o.label === label)) return
        // As a click does: picking a crossed-out choice un-crosses it.
        if (crossOut.has(label)) toggleCrossOut(label)
        respond(label)
        return
      }
      // Enter on a focused control is that control's own click.
      if (event.key === 'Enter' && !activeSet && !result && response
          && !target?.closest?.('button, a[href], summary, [role=button]')) {
        event.preventDefault()
        void submit()
      }
    }
  })
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => onPracticeKey.current(event)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /**
   * How THIS set is going, cell by cell.
   *
   * Not the same as each question's own history: redo a set and every question
   * in it has been answered before, so the navigator would show a full grid of
   * greens before you had answered anything. A set is one pass, so there is no
   * retry state within it.
   */
  const answers = activeSet?.items
  const setStates = useMemo<CellState[] | undefined>(() => {
    if (!answers) return undefined
    const byId = new Map(answers.map((i) => [i.question_id, i]))
    // Answered or not, never right or wrong: nothing is graded until the set is
    // finished, and a green cell would give the answer away.
    return items.map((item) => {
      const row = byId.get(item.id)
      return !row || isBlank(row) ? 'unanswered' : 'answered'
    })
  }, [answers, items])

  /** Nothing left unanswered in this set. */
  const setComplete = Boolean(
    activeSet && setStates?.length && setStates.every((st) => st !== 'unanswered'),
  )

  // The list row knows the section before the question loads. Falling straight
  // to the filters made the Math tools blink out and back on every Next in
  // mixed practice, and Directions show the wrong section meanwhile.
  const section = question?.section ?? current?.section ?? filters.section ?? 'RW'
  const backLabel = activeSet ? 'Save and exit' : `Back to ${BACK_TO[practiceFrom] ?? 'Home'}`

  /**
   * One question on its own (Review, an ID search, a ?q= link) has nowhere for
   * Back and Next to go, so its footer offers a way on instead: more of the
   * same type, or the whole skill. Worked out up front so the button is ready
   * the moment the answer is graded.
   */
  const single = items.length === 1 && !activeSet
  const [similar, setSimilar] = useState<{ ids: string[]; title: string } | null>(null)
  useEffect(() => {
    setSimilar(null)
    if (!single || !current) return
    let stale = false
    Promise.all([loadProcessTypes(), api.questionsById()]).then(([pt, byId]) => {
      if (stale || !pt) return
      const ids = similarTo(current, [...byId.values()], pt).map((s) => s.id)
      setSimilar({ ids, title: `Similar: ${typeOf(current.cb_id, pt)?.label ?? current.skill_name}` })
    }).catch(() => { /* the skill button alone still leads on */ })
    return () => { stale = true }
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- keyed by question id: a new object for the same question changes nothing
  }, [single, current?.id])
  // Reads like Bluebook's "Section 1, Module 2: Reading and Writing": the
  // section, then whatever the filters narrowed it to.
  const setTitle = useMemo(() => {
    // A set describes itself from the filters it was BUILT with. Reading the
    // live filter state instead made a resumed set announce whatever the home
    // page happened to be showing.
    if (listTitle && !activeSet) return listTitle
    const f = activeSet?.filters ?? filters
    if (f.title) return f.title
    const lead = f.section ? SECTION_NAME[f.section] : 'All topics'
    if (f.skills?.length === 1 && question?.skill_name) {
      return `${lead}: ${question.skill_name}`
    }
    if (f.domains?.length === 1 && question?.domain_name) {
      return `${lead}: ${question.domain_name}`
    }
    return lead
  }, [activeSet, listTitle, filters, question?.domain_name, question?.skill_name])

  useEffect(() => {
    document.title = titleFor('practice', '', { index, count: items.length, set: setTitle })
  }, [index, items.length, setTitle])

  return (
    <div className="app">
      <SkipLink to="question">Skip to question</SkipLink>
      <header className="topbar">
        <div className="topbar-left">
          <div className="section-title">
            <button className="backbtn" title={backLabel} aria-label={backLabel}
                    onClick={leavePractice}>
              <Icon name="chevron-left" size={18} strokeWidth={2.2} />
            </button>
            {/* Wrapped so it can be truncated on a phone. A bare text node in a
                flex row cannot take text-overflow. */}
            <h1 className="section-name" id="view-title" tabIndex={-1}>{setTitle}</h1>
          </div>
          <button className="ghostlink" onClick={() => setShowDirections((v) => !v)}
                  aria-expanded={showDirections} aria-controls={DIRECTIONS_ID}>
            Directions
            <Icon name={showDirections ? 'chevron-up' : 'chevron-down'} size={15}
                  strokeWidth={2.2} />
          </button>
        </div>

        <PracticeClock remaining={remaining} seconds={seconds} />

        <div className="topbar-right">
          {question ? <QuestionInfo question={question} /> : null}
          {section === 'MATH' ? (
            <Tool icon={<Icon name="ruler" size={21} />} label="Reference"
                  on={showReference} onClick={() => setShowReference((v) => !v)} />
          ) : null}
          {section === 'MATH' && DESMOS_EMBEDDED ? (
            <Tool icon={<Icon name="calculator" size={21} />} label="Calculator"
                  on={showDesmos} onClick={() => setShowDesmos((v) => !v)} />
          ) : null}
          {section === 'MATH' && !DESMOS_EMBEDDED ? (
            // Fallback when VITE_DESMOS_KEY is unset: hand off to Desmos's free
            // calculator site rather than embedding it. The second glyph says a tab opens.
            <Tool icon={<><Icon name="calculator" size={21} /><Icon name="external" size={15} /></>}
                  label="Calculator" href="https://www.desmos.com/calculator"
                  name="Calculator (opens desmos.com in a new tab)"
                  title="Opens the Desmos graphing calculator in a new tab" />
          ) : null}
          <Tool icon={<><Icon name="highlighter" size={21} /><Icon name="note" size={20} /></>}
                label="Highlights & Notes" count={annotations.length}
                name={annotations.length ? `Highlights and notes, ${annotations.length}` : 'Highlights and notes'}
                on={showNotes} dialog onClick={() => setShowNotes((v) => !v)} />
          {/* Lifetime score, so it says what it counts. Not in a set, where a
              number ticking up on every answer would read as set progress. */}
          {stats?.attempts && !activeSet ? (
            <div className="tool static" role="img"
                 aria-label={`${stats.correct} correct of ${stats.attempts} answered`}
                 title={`${stats.correct} correct of ${stats.attempts} answered`}>
              <span className="tool-glyphs">
                <Icon name="check" size={19} />
                <span className="tool-score">{stats.correct}/{stats.attempts}</span>
              </span>
              <span className="tool-label"><span className="tool-text">Correct</span></span>
            </div>
          ) : null}
        </div>
      </header>

      {/* Set review covers this screen, so the banner moves onto it instead. */}
      {showSetReview && activeSet ? null : banner}

      <main id="question" tabIndex={-1}
            className={desmosSplit === null ? 'main' : 'main is-split-tool'}
            style={desmosSplit === null
              ? undefined
              : ({ '--tool-split': `${desmosSplit}%` } as React.CSSProperties)}>
        {loading && slowLoad ? (
          // Bluebook's own layout, flat and pulsing: the passage pane beside
          // the question for Reading and Writing, one column for Math.
          <div className="qview" aria-busy="true">
            <span className="sr-only" role="status">Loading the question</span>
            {current?.section === 'RW' ? (
              <div className="split qskel-split">
                <div className="pane"><div className="prompt"><span className="skel qskel-passage" /></div></div>
                <div className="qskel-divider" />
                <div className="pane"><div className="prompt">{qskelChoices}</div></div>
              </div>
            ) : (
              <div className="single">
                <div className="pane"><div className="prompt">{qskelChoices}</div></div>
              </div>
            )}
          </div>
        ) : null}
        {!loading && !current ? (
          <div className="placeholder">No questions match these filters.</div>
        ) : null}
        {!loading && question && current ? (
          // Keyed by question, so Next clears a crash and the bar below keeps working.
          <ErrorBoundary key={current.id} context="question" onReset={leavePractice}>
            <QuestionView
              question={question}
              number={index + 1}
              annotations={annotations}
              result={result}
              seconds={seconds}
              response={response}
              flagged={flagged}
              crossOutMode={crossOutMode}
              crossOut={crossOut}
              deferred={Boolean(activeSet)}
              coach={coachOn === question.id && !result ? (
                <div className="coach" role="note">
                  <Icon name="info" size={18} />
                  <p>
                    {question.type === 'mcq' ? 'Pick an answer' : 'Enter your answer'}
                    {/* A set has no Submit: answers are held and graded at the end. */}
                    {activeSet ? ', then Next. The set is graded at the end, with every explanation.'
                      : ", then Submit. You'll see the explanation right away."}
                  </p>
                  <button type="button" className="coach-x" aria-label="Dismiss tip" onClick={() => setCoachOn(null)}>
                    <Icon name="close" size={16} />
                  </button>
                </div>
              ) : null}
              onRespond={respond}
              onSubmit={submit}
              onToggleFlag={toggleFlag}
              onToggleCrossOutMode={() => setCrossOutMode((v) => !v)}
              onToggleCrossOut={toggleCrossOut}
              onAddAnnotation={(a) => persistAnnotations([...annotations, { ...a, id: nextAnnotationId(annotations) }])}
              onUpdateAnnotation={updateAnnotation}
              onRemoveAnnotation={removeAnnotation}
              mistake={mistake}
              // Returned so the mistake card can confirm "Saved"; rethrown so
              // a failed save does not.
              onSaveMistake={(tags, note) => api.saveMistake(current.id, tags, note)
                .then((r) => setMistake(r.mistake))
                .catch((e: Error) => { fail(e); throw e })}
            />
          </ErrorBoundary>
        ) : null}
        {/* Math tools only over Math. Their open state is kept, so a Reading
            question in mixed practice hides them and the next Math one brings
            them back. */}
        <Suspense fallback={null}>
          {showDesmos && DESMOS_EMBEDDED && section === 'MATH' ? (
            <Desmos onClose={() => setShowDesmos(false)}
                    onExpandedChange={setDesmosSplit} />
          ) : null}
          {showReference && section === 'MATH' ? <ReferenceSheet onClose={closeReference} /> : null}
        </Suspense>
      </main>

      <footer className="bottombar">
        {/* Where Bluebook puts the student's name. */}
        <div className="bottom-left">
          <Mark size={20} />
          <span className="wordmark">Light<span className="wordmark-blue">Blue</span>Prep</span>
        </div>
        <div className="bottom-mid">
          <button className="navbtn" onClick={() => setShowNavigator(true)}
                  aria-haspopup="dialog" aria-expanded={showNavigator}
                  disabled={items.length <= 1}>
            Question {items.length ? index + 1 : 0} of {items.length.toLocaleString()}
            <Icon name="chevron-up" size={15} strokeWidth={2.2} />
          </button>
        </div>
        {single && current ? (
          <div className="bottom-right">
            {!result ? (
              <button className="btn primary" onClick={leavePractice}>
                {oneFrom === 'review' ? 'Back to Review' : 'Done'}
              </button>
            ) : (
              <>
                <button className={similar?.ids.length ? 'btn quiet bottom-more' : 'btn primary'}
                        title={`All ${current.skill_name} questions`}
                        onClick={() => practiceFilters({ skills: [current.skill] })}>
                  <span className="btn-trunc">All {current.skill_name} questions</span>
                </button>
                {similar?.ids.length ? (
                  <button className="btn primary" onClick={() => practiceMany(similar.ids, similar.title)}>
                    {/* A 375px phone has no room for the word beside the navigator. */}
                    <span><span className="next-word">Next: </span>{similar.ids.length} more like this</span>
                    <Icon name="arrow-right" size={17} strokeWidth={2.2} />
                  </button>
                ) : null}
              </>
            )}
          </div>
        ) : (
          <div className="bottom-right">
            <button className="btn primary" onClick={() => go(index - 1)} disabled={index <= 0}>
              Back
            </button>
            {/* On the last question of a set, Next becomes the way out. Bluebook
                does the same thing rather than showing both. */}
            {activeSet && index >= items.length - 1 ? (
              <button className="btn primary" onClick={() => setShowSetReview(true)}>
                Review
                <Icon name="arrow-right" size={17} strokeWidth={2.2} />
              </button>
            ) : (
              <button className="btn primary" onClick={() => go(index + 1)}
                      disabled={index >= items.length - 1}>
                Next
              </button>
            )}
          </div>
        )}
      </footer>

      {showNavigator ? (
        <Navigator items={items} current={index} title={setTitle}
                   onGo={go} onClose={closeNavigator}
                   states={setStates}
                   complete={setComplete}
                   onReviewPage={activeSet ? openReviewPage : undefined} />
      ) : null}

      {showSetReview && activeSet ? (
        <Suspense fallback={null}>
          <SetReview items={items} current={index} title={setTitle}
                     states={setStates}
                     remaining={remaining}
                     clock={remaining === null ? null : formatClock(remaining)}
                     onGo={go}
                     onClose={() => setShowSetReview(false)}
                     busy={set.finishing}
                     banner={banner}
                     onFinish={set.finish} />
        </Suspense>
      ) : null}

      {showNotes ? (
        <Notes annotations={annotations}
               onRemove={removeAnnotation}
               onClose={() => setShowNotes(false)} />
      ) : null}

      {showDirections ? (
        <Directions lines={DIRECTIONS[section]} keys={activeSet ? KEYS_SET : KEYS_OPEN}
                    spr={question?.type === 'spr'}
                    onClose={() => setShowDirections(false)} />
      ) : null}
      <FeedbackHost />
      <SupportHost />
    </div>
  )
}

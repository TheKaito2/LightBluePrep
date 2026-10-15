import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as api from './api'
import { Home } from './components/Home'
import { Stats as StatsPage } from './components/Stats'
import { About } from './components/About'
import { Settings } from './components/Settings'
import { AccountBadge } from './components/Account'
import { GithubLink } from './components/Github'
import { SupportHost, SupportLink } from './components/Support'
import { Navigator } from './components/Navigator'
import { Notes } from './components/Notes'
import { QuestionInfo } from './components/QuestionInfo'
import { ReferenceSheet } from './components/ReferenceSheet'
import { Review } from './components/Review'
import { QuestionView } from './components/QuestionView'
import { Desmos, DESMOS_EMBEDDED } from './components/Desmos'
import { Icon } from './components/Icon'
import { Mark } from './components/Mark'
import { Footer } from './components/Footer'
import { SetResults } from './components/SetResults'
import type { CellState } from './components/Navigator'
import { SetReview } from './components/SetReview'
import { FeedbackHost } from './components/Feedback'
import { Inbox } from './components/Inbox'
import { Resources } from './components/Resources'
import { ErrorBanner } from './components/ErrorBanner'
import { ErrorBoundary } from './components/ErrorBoundary'
import { sample, sampleBalanced } from './lib/draw'
import { arrange, type Order } from './lib/order'
import { loadFilters, loadOrder, saveFilters, saveOrder } from './lib/prefs'
import { COACH_KEY, getMeta, setMeta } from './lib/store'
import type { HistoryRow } from './lib/progress'
import { setSeconds, formatClock } from './lib/pacing'
import { useQuestionTimer } from './lib/useTimer'
import { SECTION_NAME } from './lib/labels'
import * as sync from './lib/sync'
import { toUserMessage } from './lib/errors'
import { parseHash, titleFor, urlFor, type View } from './lib/route'
import type {
  Annotation, Filters, GradeResult, Mistake, PracticeSet, Question, SetAnswer,
  SetItem, Stats, TaxonomyRow,
} from './types'

/**
 * How often a running set banks the time spent on the current question. This
 * is the most a reload can refund, so it wants to be short; it is also a write
 * each time, so it does not want to be every second.
 */
const SET_FLUSH_SECONDS = 5

const DIRECTIONS = {
  RW: [
    'The questions in this section address a number of important reading and writing skills. Each question includes one or more passages, which may include a table or graph. Read each passage and question carefully, and then choose the best answer to the question based on the passage(s).',
    'All questions in this section are multiple-choice with four answer choices. Each question has a single best answer.',
  ],
  MATH: [
    'The questions in this section address a number of important math skills. Use of a calculator is permitted for all questions.',
    'For multiple-choice questions, solve each problem and choose the correct answer from the choices provided. For student-produced response questions, solve each problem and enter your answer.',
  ],
} as const

const NAV = [
  { key: 'home', label: 'Practice', icon: 'grid' },
  { key: 'review', label: 'Review', icon: 'history' },
  { key: 'stats', label: 'Stats', icon: 'chart' },
  { key: 'resources', label: 'Resources', icon: 'compass' },
  { key: 'about', label: 'About', icon: 'info' },
] as const

/** Links into the app that open practice; they win over Home's stored picks. */
const DEEP_LINK_KEYS = ['q', 'skill', 'type']
const hasDeepLink = () => DEEP_LINK_KEYS.some((k) => new URLSearchParams(window.location.search).has(k))

/** Session length for someone with no answers yet: a short set with an end, not all 3,767 (H-31). */
const FIRST_SIZE = 10

/** index.html's own title, which Home goes back to. */
const HOME_TITLE = document.title

/** Move focus to an in-page target without letting the hash reach the router. */
function skipTo(id: string) {
  return (event: React.MouseEvent) => {
    event.preventDefault()
    document.getElementById(id)?.focus()
  }
}

export default function App() {
  // A deep link (?q, ?skill, ?type) wins over the hash: it opens practice
  // from Home below, so Back from it lands on Home.
  const [view, setView] = useState<View>(() => (hasDeepLink() ? 'home' : parseHash(window.location.hash)))
  const viewRef = useRef(view)
  useEffect(() => { viewRef.current = view }, [view])

  /**
   * Show `next` and give it a history entry, so Back and reload behave like
   * pages. Practice and Results keep the URL they were opened from: what they
   * show is in memory, and a reload there lands on the page underneath.
   */
  const navigate = useCallback((next: View, replace = false) => {
    const url = urlFor(next, window.location.href)
    // Clicking the tab you are on must not add a step to Back.
    if (replace || next !== viewRef.current || url.href !== window.location.href) {
      history[replace ? 'replaceState' : 'pushState']({ view: next }, '', url)
    }
    setView(next)
  }, [])

  /** Bumped by a sync that pulled rows; drives the taxonomy refetch below. */
  const [dataVersion, setDataVersion] = useState(0)

  const [taxonomy, setTaxonomy] = useState<TaxonomyRow[]>([])
  /** True from the start of a taxonomy fetch until it settles, so Home can tell loading from failed. */
  const [taxonomyLoading, setTaxonomyLoading] = useState(true)
  const [stats, setStats] = useState<Stats | null>(null)
  const [attemptLog, setAttemptLog] = useState<HistoryRow[]>([])
  // Home's picks survive a reload (H-32). Read once, before the first render.
  const [storedFilters] = useState(loadFilters)
  const [filters, setFilters] = useState<Filters>(() => storedFilters ?? {})
  useEffect(() => saveFilters(filters), [filters])
  /** Nothing stored and no link: the first-visit default may still apply once stats say there is no history. */
  const firstVisit = useRef(storedFilters === null && !hasDeepLink())
  const [items, setItems] = useState<SetItem[]>([])
  const [index, setIndex] = useState(0)
  const [listLoading, setListLoading] = useState(true)

  const [question, setQuestion] = useState<Question | null>(null)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [flagged, setFlagged] = useState(false)
  const [response, setResponse] = useState<string | null>(null)
  const [result, setResult] = useState<GradeResult | null>(null)
  const [crossOut, setCrossOut] = useState<Set<string>>(new Set())
  // On by default: the cross-out tool is more useful than it is intrusive.
  const [crossOutMode, setCrossOutMode] = useState(true)

  /**
   * The set being worked through, if this is a set rather than open practice.
   *
   * Its `items` are the frozen question list AND the progress against them, so
   * everything about a set (which questions, in what order, how far in) lives
   * in this one row and survives a reload or a second device.
   */
  const [activeSet, setActiveSet] = useState<PracticeSet | null>(null)
  /**
   * The same set, readable synchronously.
   *
   * Answering twice in quick succession used to lose the first answer: both
   * handlers closed over the `activeSet` of their own render, so the second one
   * rebuilt `items` from a copy that did not have the first answer in it yet.
   * Every write goes through this ref so it always starts from the latest.
   */
  const activeSetRef = useRef<PracticeSet | null>(null)
  const [activeSets, setActiveSets] = useState<PracticeSet[]>([])
  /** The finished set being read back on the results screen. */
  const [shownSet, setShownSet] = useState<PracticeSet | null>(null)
  const [showSetReview, setShowSetReview] = useState(false)
  /** Seconds left on the set clock. Null when the set is untimed. */
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => { activeSetRef.current = activeSet }, [activeSet])

  /**
   * A set only exists while you are in it.
   *
   * It used to outlive the practice screen: back out of a set halfway, then
   * open plain practice from Home, Review or Stats, and the app still thought
   * it was in the set. Every question rendered in set mode with no Submit
   * button, and the answers went nowhere. Its progress is saved as you go, and
   * Resume reloads it, so dropping it here loses nothing.
   */
  useEffect(() => {
    if (view === 'practice') return
    activeSetRef.current = null
    setActiveSet(null)
  }, [view])

  const [showNavigator, setShowNavigator] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [showReference, setShowReference] = useState(false)
  const closeReference = useCallback(() => setShowReference(false), [])
  const [mistake, setMistake] = useState<Mistake | null>(null)
  const [showDirections, setShowDirections] = useState(false)
  const [showTimer, setShowTimer] = useState(true)
  const [showDesmos, setShowDesmos] = useState(false)
  const [desmosSplit, setDesmosSplit] = useState<number | null>(null)
  const [error, setError] = useState<{ message: string; retry?: () => void } | null>(null)
  /** Every failure the app shows goes through here, never a raw message. */
  const fail = useCallback((e: unknown, retry?: () => void) => {
    setError({ message: toUserMessage(e), retry })
  }, [])
  /**
   * Bumped by Retry to re-run the taxonomy or question load. One counter is
   * enough: the question load only runs in practice and the taxonomy only
   * outside it.
   */
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((n) => n + 1), [])
  const [loading, setLoading] = useState(false)

  const current = items[index] ?? null
  const practising = view === 'practice'
  const seconds = useQuestionTimer(
    current?.id ?? null, practising && question !== null && result === null)

  /**
   * Re-read the taxonomy whenever you land back on Home or Stats, and whenever
   * a sync pulls something new.
   *
   * This used to run once on mount. Answering a question updates the stores but
   * nothing told React, so "Bank progress", the per-card progress and the whole
   * Stats page kept showing the numbers from page load until you reloaded.
   * Practice is excluded because the numbers are not on screen there and the
   * set list would refetch under you mid-question.
   */
  useEffect(() => {
    if (view === 'practice') return
    let stale = false
    setTaxonomyLoading(true)
    api.taxonomy()
      .then((d) => {
        if (stale) return
        setTaxonomy(d.taxonomy); setStats(d.stats)
        if (firstVisit.current && !d.stats.attempts) {
          // Unless a length was already picked in the moment before this landed.
          setFilters((f) => ('size' in f ? f : { ...f, size: FIRST_SIZE }))
        }
        firstVisit.current = false
      })
      .catch((e: Error) => !stale && fail(e, reload))
      .finally(() => { if (!stale) setTaxonomyLoading(false) })
    // Streaks and the score estimate on Home read every attempt.
    api.history()
      .then((d) => { if (!stale) setAttemptLog(d.history) })
      .catch(() => {})
    return () => { stale = true }
  }, [view, dataVersion, reloadKey, fail, reload])

  // Starts the sync loop if a session already exists. No-op when signed out or
  // when the build has no sync configured, so the localhost path is untouched.
  useEffect(() => { sync.start() }, [])

  /**
   * Open one question on its own, from Review. The set becomes just that
   * question, so Back and Next have nowhere to wander and the navigator says
   * 1 of 1.
   */
  /** Questions whose College Board ID starts with `needle`, exact match first. */
  const findIds = useCallback((needle: string) => api.questionSet({}).then((d) => d.questions
    .filter((q) => (q.cb_id ?? '').toLowerCase().startsWith(needle))
    .sort((a, b) => Number(b.cb_id?.toLowerCase() === needle) - Number(a.cb_id?.toLowerCase() === needle))), [])

  /** Title for a list opened from Review ("Review: Incorrect"). */
  const [listTitle, setListTitle] = useState<string | null>(null)
  useEffect(() => { if (view !== 'practice') setListTitle(null) }, [view])

  const practiceMany = useCallback((ids: string[], title: string) => {
    api.questionSet({}).then((d) => {
      const byId = new Map(d.questions.map((q) => [q.id, q]))
      const list = ids.flatMap((id) => byId.get(id) ?? [])
      if (!list.length) return
      setItems(list); setIndex(0); setListTitle(title); navigate('practice')
    }).catch((e: Error) => fail(e))
  }, [fail, navigate])

  const practiceOne = useCallback((id: string) => {
    const found = items.find((i) => i.id === id)
    if (found) { setItems([found]); setIndex(0); navigate('practice'); return }
    api.questionSet({}).then((d) => {
      const one = d.questions.find((q) => q.id === id)
      if (one) { setItems([one]); setIndex(0); navigate('practice') }
    }).catch((e: Error) => fail(e))
  }, [items, fail, navigate])

  /**
   * Back, Forward and hash links (the account panel's #inbox) all land here.
   * Results comes back only while its set is still in memory; anything else
   * the URL names.
   */
  const shownSetRef = useRef<PracticeSet | null>(null)
  useEffect(() => { shownSetRef.current = shownSet }, [shownSet])
  const bankTime = useRef(() => {})
  useEffect(() => {
    const follow = () => {
      // Leaving a set by Back must bank the clock the way the in-app back
      // button does; the interval flush only runs every few seconds.
      if (viewRef.current === 'practice') bankTime.current()
      const results = history.state?.view === 'results' && shownSetRef.current
      setView(results ? 'results' : parseHash(window.location.hash))
    }
    window.addEventListener('popstate', follow)
    window.addEventListener('hashchange', follow)
    return () => {
      window.removeEventListener('popstate', follow)
      window.removeEventListener('hashchange', follow)
    }
  }, [])

  // A pull from another device changes the same numbers an answer does.
  useEffect(() => sync.subscribe(() => setDataVersion(sync.getDataVersion())), [])

  /** Home list order; `seed` changes each time Reshuffle is pressed. Both kept across reloads. */
  const [storedOrder] = useState(loadOrder)
  const [order, setOrder] = useState<Order>(storedOrder.order)
  const [seed, setSeed] = useState(storedOrder.seed)
  useEffect(() => saveOrder({ order, seed }), [order, seed])

  // Named so the Retry it hands the banner can call it again.
  const loadList = useCallback(function load() {
    let stale = false
    setListLoading(true)
    api.questionSet(filters)
      .then((d) => { if (!stale) { setItems(arrange(d.questions, order, seed)); setIndex(0) } })
      .catch((e: Error) => !stale && fail(e, () => { load() }))
      .finally(() => { if (!stale) setListLoading(false) })
    return () => { stale = true }
  }, [filters, order, seed, fail])

  useEffect(loadList, [loadList])

  /** Home's "Try again" when the first load failed: the topics and the pool both. */
  const retryBoot = useCallback(() => { setError(null); reload(); loadList() }, [reload, loadList])

  /**
   * The pool under difficulty, status and skip-live alone, ignoring the picked
   * topics, so every skill row on Home can say how many of its questions the
   * active filters leave ("87 hard"). `items` cannot: it holds only the ticked
   * skills. Skipped when no such filter is set, since the row totals are then
   * the answer.
   */
  const [facetItems, setFacetItems] = useState<SetItem[] | null>(null)
  useEffect(() => {
    if (view !== 'home' || (!filters.difficulties?.length && !filters.statuses?.length)) return
    let stale = false
    api.questionSet({ difficulties: filters.difficulties, statuses: filters.statuses, excludeLive: filters.excludeLive })
      .then((d) => { if (!stale) setFacetItems(d.questions) })
      // The counts are a hint; the start bar already shows the real total.
      .catch(() => { if (!stale) setFacetItems(null) })
    return () => { stale = true }
  }, [view, filters.difficulties, filters.statuses, filters.excludeLive, dataVersion])

  /**
   * Practise a filter straight from Stats. The list is loaded first and then
   * shown, rather than switching to practice while `items` still held the
   * previous list, which flashed an unrelated question for a moment.
   */
  const practiceFilters = useCallback((next: Filters) => {
    api.questionSet(next).then((d) => {
      // An empty pool (a stale link's unknown skill) changes nothing: no
      // practice on nothing, and no invisible filter left behind on Home.
      if (!d.questions.length) return
      // A link names only the skill. Its section is what makes the header read
      // "Math: Linear functions" rather than "All questions: ...".
      setFilters(next.skills?.length === 1 && !next.section
        ? { ...next, section: d.questions[0].section } : next)
      setItems(arrange(d.questions, order, seed)); setIndex(0); navigate('practice')
    }).catch((e: Error) => fail(e))
  }, [order, seed, fail, navigate])

  /**
   * Links into the app: ?q=<College Board ID> opens that question, ?skill=<code>
   * practises a skill and ?type=<skill.key> one question type. They come from
   * Info's Link button, video descriptions and the static /skills pages. Read
   * once on load, then dropped from the address bar (with any hash) so a reload
   * lands on Home, and so does Back: Home is the entry practice is pushed over.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const q = params.get('q')?.trim().toLowerCase()
    const skill = params.get('skill')
    const type = params.get('type')
    if (!q && !skill && !type) return
    // A URL object, like the #inbox handler: "//?q=" must not throw.
    const url = new URL(window.location.href)
    for (const key of DEEP_LINK_KEYS) url.searchParams.delete(key)
    url.hash = ''
    history.replaceState({ view: 'home' }, '', url)
    if (q) {
      findIds(q).then((m) => {
        if (m[0]?.cb_id?.toLowerCase() === q) practiceOne(m[0].id)
      }).catch((e: Error) => fail(e))
    } else if (type?.includes('.')) {
      practiceFilters({ skills: [type.slice(0, type.lastIndexOf('.'))], types: [type] })
    } else if (skill) {
      practiceFilters({ skills: [skill] })
    }
    // Once, on load: these callbacks change identity as the list loads, and
    // re-running would reopen the link every time.
  }, [fail])

  // Landing back on Home reloads the list: answers since then change its status
  // marks, and opening one question or a set replaced `items` with just those.
  const mounted = useRef(false)
  useEffect(() => {
    // The effect above already loaded on mount.
    if (!mounted.current) { mounted.current = true; return }
    if (view === 'home') return loadList()
  }, [view, dataVersion])

  /**
   * The question the one-time tip is showing on, if any (H-31): only the very
   * first question someone sees, judged by having no answers and no note that
   * it was shown. Checked once per page load.
   */
  const [coachOn, setCoachOn] = useState<string | null>(null)
  const coachChecked = useRef(false)
  useEffect(() => {
    if (!practising || !question || !stats || coachChecked.current) return
    coachChecked.current = true
    if (stats.attempts) return
    const id = question.id
    getMeta<boolean>(COACH_KEY).then((shown) => {
      if (shown) return
      setCoachOn(id)
      return setMeta(COACH_KEY, true)
    }).catch(() => { /* no storage: skip the tip rather than show it every visit */ })
  }, [practising, question, stats])

  useEffect(() => {
    if (!practising || !current) { setQuestion(null); return }
    let stale = false
    setLoading(true)
    setQuestion(null); setResult(null)
    // Inside a set the answer is held rather than submitted, so coming back to
    // a question has to put the choice back.
    const held = activeSetRef.current?.items
      ?.find((i) => i.question_id === current.id)?.response ?? null
    setResponse(activeSetRef.current ? held : null)
    setCrossOut(new Set()); setAnnotations([])
    api.question(current.id)
      .then((d) => {
        if (stale) return
        setQuestion(d.question); setAnnotations(d.annotations); setFlagged(d.flagged)
        setMistake(d.mistake)
      })
      .catch((e: Error) => !stale && fail(e, reload))
      .finally(() => { if (!stale) setLoading(false) })
    return () => { stale = true }
  }, [current?.id, practising, reloadKey, fail, reload])

  /** Reload the queue of unfinished sets shown on Home. */
  const refreshActiveSets = useCallback(() => {
    api.listSets(true).then(setActiveSets).catch(() => {})
  }, [])

  useEffect(() => {
    if (view === 'home') refreshActiveSets()
  }, [view, dataVersion, refreshActiveSets])

  /**
   * Freeze drawn questions into a new set and start working through them.
   * `built` is stored as the set's filters, which is what names it later.
   *
   * The draw happens here rather than in a backend because both backends hand
   * the whole pool over anyway, and doing it once on the client is what keeps
   * the two identical.
   */
  const beginSet = useCallback(async (chosen: SetItem[], built: Filters) => {
    try {
      const created = await api.saveSet({
        id: crypto.randomUUID(),
        created_at: Math.floor(Date.now() / 1000),
        finished_at: null,
        seconds: 0,
        filters: built,
        items: chosen.map((q) => ({
          question_id: q.id, response: null, correct: 0, seconds: 0,
        })),
      })
      setActiveSet(created)
      setItems(chosen)
      setIndex(0)
      navigate('practice')
    } catch (e) { fail(e) }
  }, [fail, navigate])

  const startSet = useCallback(async () => {
    if (!filters.size) { setIndex(0); navigate('practice'); return }
    // Names go in with the set so it can still say what it covers if a later
    // build no longer knows one of these skill codes.
    const skill_names = filters.skills?.map((code) =>
      taxonomy.find((r) => r.skill === code)?.skill_name ?? code)
    await beginSet(sample(items, filters.size), skill_names ? { ...filters, skill_names } : filters)
  }, [filters, items, taxonomy, beginSet, navigate])

  /** The hero's one-tap start: 10 questions from the whole bank, whatever the topic picker says. */
  const quickSet = useCallback(() => {
    api.questionSet({})
      .then((d) => beginSet(sample(d.questions, 10), { size: 10 }))
      .catch((e: Error) => fail(e))
  }, [beginSet, fail])

  /**
   * The locked score card's button: 10 Reading and Writing then 10 Math, so
   * finishing it unlocks both sections. Drawn from questions not tried yet,
   * because only a first try counts toward the estimate.
   */
  const scoreCheck = useCallback(() => {
    api.questionSet({})
      .then((d) => beginSet(
        sampleBalanced(d.questions.filter((q) => !q.answered_at), (q) => q.section, { RW: 10, MATH: 10 }),
        { size: 20, title: 'Score check' }))
      .catch((e: Error) => fail(e))
  }, [beginSet, fail])

  /** Put a set's frozen questions back on screen, at the first unanswered one. */
  const openSet = useCallback(async (id: string) => {
    try {
      const set = await api.getSet(id)
      const pool = await api.questionSet({})
      const byId = new Map(pool.questions.map((q) => [q.id, q]))
      // Order comes from the set, not the pool: that is what makes it the same
      // set every time. A question retired since it was drawn simply drops out.
      const ordered = (set.items ?? [])
        .map((i) => byId.get(i.question_id))
        .filter((q): q is SetItem => Boolean(q))
      const firstOpen = (set.items ?? []).findIndex((i) => i.response === null)
      setActiveSet(set)
      setItems(ordered)
      setIndex(firstOpen < 0 ? 0 : Math.min(firstOpen, ordered.length - 1))
      navigate('practice')
    } catch (e) { fail(e) }
  }, [fail, navigate])

  /**
   * Drop a set for good, from either list.
   *
   * Deleting the set does not touch the attempts it produced: those are your
   * practice history and belong to the questions, not to the set.
   */
  const dropSet = useCallback(async (id: string): Promise<boolean> => {
    try {
      await api.deleteSet(id)
      if (activeSet?.id === id) setActiveSet(null)
      if (shownSet?.id === id) { setShownSet(null); navigate('review') }
      setActiveSets((prev) => prev.filter((s) => s.id !== id))
      refreshActiveSets()
      return true
    } catch (e) { fail(e); return false }
  }, [refreshActiveSets, activeSet?.id, shownSet?.id, fail, navigate])

  const abandonSet = dropSet

  /** Write the set's progress back. Called after every answer. */
  const persistSet = useCallback(async (
    next: SetAnswer[], finished: boolean, spent: number,
  ) => {
    const live = activeSetRef.current
    if (!live) return null
    try {
      const saved = await api.saveSet({
        id: live.id,
        created_at: live.created_at,
        finished_at: finished ? Math.floor(Date.now() / 1000) : null,
        seconds: spent,
        filters: live.filters,
        items: next,
      })
      // Only the finish path writes back. Adopting the server's row after a
      // progress write would undo any answer given while the request was in
      // flight, which is exactly what the HTTP backend's round trip makes easy.
      // The local ref is authoritative for the length of the session.
      if (finished) { activeSetRef.current = null; setActiveSet(null) }
      return saved
    } catch (e) { fail(e); return null }
  }, [fail])

  /** End the set and show the score. */
  const finishSet = useCallback(async () => {
    const live = activeSetRef.current
    if (!live) return
    const spent = live.seconds ?? 0
    // Everything is graded here rather than as it was answered, which is also
    // where the attempts get recorded. A question left blank is not attempted.
    const graded = await Promise.all((live.items ?? []).map(async (i) => {
      if (i.response === null || i.response === '') return { ...i, correct: 0 as const }
      try {
        const r = await api.answer(i.question_id, i.response, i.seconds || 0)
        return { ...i, correct: (r.correct ? 1 : 0) as 0 | 1 }
      } catch { return { ...i, correct: 0 as const } }
    }))
    activeSetRef.current = { ...live, items: graded }
    const saved = await persistSet(graded, true, spent)
    setShowSetReview(false)
    setShownSet(saved)
    setRemaining(null)
    navigate('results', true)
    refreshActiveSets()
    api.taxonomy().then((d) => { setTaxonomy(d.taxonomy); setStats(d.stats) }).catch(() => {})
  }, [persistSet, refreshActiveSets, navigate])

  /**
   * The set clock.
   *
   * Priced per question from the real test's own pace and started when the set
   * is opened, not when it was created, so closing the tab does not run it
   * down. Running out ends the set exactly as finishing it does, which is what
   * the real thing does at the end of a module.
   */
  useEffect(() => {
    if (!practising || !activeSet?.filters?.speed) { setRemaining(null); return }
    const sections = items.map((i) => i.section)
    const total = setSeconds(sections, activeSet.filters.speed)
    const left = Math.max(0, total - (activeSet.seconds ?? 0))
    setRemaining(left)
    if (!left) return
    const started = Date.now()
    const tick = setInterval(() => {
      const now = Math.max(0, left - Math.floor((Date.now() - started) / 1000))
      setRemaining(now)
      if (now <= 0) clearInterval(tick)
    }, 1000)
    return () => clearInterval(tick)
    // activeSet.id rather than activeSet: re-running this on every answer would
    // restart the clock from the top each time.
  }, [practising, activeSet?.id, activeSet?.filters?.speed, items])

  useEffect(() => {
    if (remaining === 0 && activeSet) void finishSet()
  }, [remaining, activeSet, finishSet])

  /** Open a finished set's score screen from the review page. */
  const showSet = useCallback(async (id: string) => {
    try {
      setShownSet(await api.getSet(id))
      navigate('results')
    } catch (e) { fail(e) }
  }, [fail, navigate])

  /**
   * Run the same questions again as a NEW set, rather than resetting the old
   * one. The score you already have is history and has to stay put.
   */
  const redoSet = useCallback(async (old: PracticeSet) => {
    try {
      const full = old.items ? old : await api.getSet(old.id)
      const created = await api.saveSet({
        id: crypto.randomUUID(),
        created_at: Math.floor(Date.now() / 1000),
        finished_at: null,
        seconds: 0,
        filters: full.filters,
        items: (full.items ?? []).map((i) => ({
          question_id: i.question_id, response: null, correct: 0 as const, seconds: 0,
        })),
      })
      setShownSet(null)
      await openSet(created.id)
    } catch (e) { fail(e) }
  }, [fail])

  const go = useCallback((next: number) => {
    setIndex(Math.min(items.length - 1, Math.max(0, next)))
  }, [items.length])

  /**
   * Time already banked against the question on screen.
   *
   * The per-question stopwatch restarts at zero every time the question
   * changes, so on its own it reports this visit rather than the total. Adding
   * the banked figure means coming back to a question continues its clock
   * instead of replacing it with a smaller number.
   */
  const banked = useRef(0)
  useEffect(() => {
    const row = activeSetRef.current?.items?.find((i) => i.question_id === current?.id)
    banked.current = row?.seconds ?? 0
  }, [current?.id])

  /**
   * Write the time spent on the question on screen into the set.
   *
   * Never lowers a question's figure, so revisiting one cannot hand time back.
   */
  const commitElapsed = useCallback((spent: number) => {
    const live = activeSetRef.current
    const id = items[index]?.id
    if (!live || !id) return
    const total = banked.current + spent
    const row = (live.items ?? []).find((i) => i.question_id === id)
    if (!row || total <= (row.seconds || 0)) return
    const next = (live.items ?? []).map((i) => (
      i.question_id === id ? { ...i, seconds: total } : i
    ))
    const sum = next.reduce((acc, i) => acc + (i.seconds || 0), 0)
    activeSetRef.current = { ...live, items: next, seconds: sum }
    setActiveSet(activeSetRef.current)
    void persistSet(next, false, sum)
  }, [items, index, persistSet])
  useEffect(() => { bankTime.current = () => commitElapsed(seconds) }, [commitElapsed, seconds])

  /**
   * Out of practice by the way it came in: Back to Home, Review or wherever the
   * entry practice pushed sits over. A deep link or a reload has nothing under
   * it, so that goes Home.
   */
  const leavePractice = useCallback(() => {
    // Bank the time on the question on screen before the set is dropped; the
    // interval flush only runs every few seconds.
    commitElapsed(seconds)
    if (history.state?.view === 'practice') history.back()
    else navigate('home')
  }, [commitElapsed, seconds, navigate])

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
    if (!practising || !activeSet) return
    if (seconds <= 0 || seconds % SET_FLUSH_SECONDS !== 0) return
    commitElapsed(seconds)
  }, [seconds, practising, activeSet, commitElapsed])

  /**
   * Hold an answer inside a set.
   *
   * Nothing is graded and no attempt is recorded until the set is finished, the
   * same as a real module, so picking again just replaces what is held.
   */
  const holdAnswer = useCallback((value: string | null, spent: number) => {
    const live = activeSetRef.current
    if (!live) return
    const id = items[index]?.id
    if (!id) return
    const next = (live.items ?? []).map((i) => (
      i.question_id === id
        ? { ...i, response: value, seconds: Math.max(i.seconds || 0, banked.current + spent) }
        : i
    ))
    // The set clock is the sum of the questions, not a separate counter, so it
    // survives a reload the same way the answers do.
    const total = next.reduce((sum, i) => sum + (i.seconds || 0), 0)
    activeSetRef.current = { ...live, items: next, seconds: total }
    setActiveSet(activeSetRef.current)
    void persistSet(next, false, total)
  }, [items, index, persistSet])

  async function submit() {
    if (!current || !response || result) return
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
              answered_at: Math.floor(Date.now() / 1000),
              attempt_count: (item.attempt_count ?? 0) + 1,
            }
          : item
      )))
      api.stats().then(setStats).catch(() => {})

      // A set keeps its own copy of what happened, so its score is fixed on the
      // day rather than re-derived from attempts you might repeat later.
      const live = activeSetRef.current
      if (live) {
        const next = (live.items ?? []).map((i) => (
          i.question_id === current.id
            ? { ...i, response, correct: (graded.correct ? 1 : 0) as 0 | 1, seconds }
            : i
        ))
        const spent = (live.seconds ?? 0) + seconds
        // Update the ref first so an answer landing before the write returns
        // still builds on this one.
        activeSetRef.current = { ...live, items: next, seconds: spent }
        setActiveSet(activeSetRef.current)
        void persistSet(next, false, spent)
      }
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

  function toggleCrossOut(label: string) {
    setCrossOut((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else { next.add(label); if (response === label) setResponse(null) }
      return next
    })
  }

  useEffect(() => {
    if (!practising) return
    function onKey(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      // A dialog (Feedback, Support) sits over the question; keys belong to it.
      if (document.querySelector('.modal')) return
      if (event.key === 'ArrowRight') go(index + 1)
      if (event.key === 'ArrowLeft') go(index - 1)
      if (event.key === 'Escape') {
        setShowNavigator(false); setShowDesmos(false); setShowDirections(false)
        setShowNotes(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, go, practising])

  /**
   * How THIS set is going, cell by cell.
   *
   * Not the same as each question's own history: redo a set and every question
   * in it has been answered before, so the navigator would show a full grid of
   * greens before you had answered anything. A set is one pass, so there is no
   * retry state within it.
   */
  const setStates = useMemo<CellState[] | undefined>(() => {
    if (!activeSet?.items) return undefined
    const byId = new Map(activeSet.items.map((i) => [i.question_id, i]))
    // Answered or not, never right or wrong: nothing is graded until the set is
    // finished, and a green cell would give the answer away.
    return items.map((item) => {
      const row = byId.get(item.id)
      const blank = !row || row.response === null || row.response === ''
      return blank ? 'unanswered' : 'answered'
    })
  }, [activeSet?.items, items])

  /** Nothing left unanswered in this set. */
  const setComplete = Boolean(
    activeSet && setStates?.length && setStates.every((st) => st !== 'unanswered'),
  )

  const section = question?.section ?? filters.section ?? 'RW'
  // Reads like Bluebook's "Section 1, Module 2: Reading and Writing": the
  // section, then whatever the filters narrowed it to.
  const setTitle = useMemo(() => {
    // A set describes itself from the filters it was BUILT with. Reading the
    // live filter state instead made a resumed set announce whatever the home
    // page happened to be showing.
    if (listTitle && !activeSet) return listTitle
    const f = activeSet?.filters ?? filters
    if (f.title) return f.title
    const lead = f.section ? SECTION_NAME[f.section] : 'All questions'
    if (f.skills?.length === 1 && question?.skill_name) {
      return `${lead}: ${question.skill_name}`
    }
    if (f.domains?.length === 1 && question?.domain_name) {
      return `${lead}: ${question.domain_name}`
    }
    return lead
  }, [activeSet, listTitle, filters, question?.domain_name, question?.skill_name])

  useEffect(() => {
    document.title = titleFor(view, HOME_TITLE, { index, count: items.length, set: setTitle })
  }, [view, index, items.length, setTitle])

  /**
   * The nav takes a hairline shadow once the page under it has scrolled. The
   * window never scrolls here: #main does, or Home's own .home inside it, and
   * scroll does not bubble, hence the capture listener.
   */
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const main = document.getElementById('main')
    if (!main) return
    const read = (el: Element | null) => (el?.scrollTop ?? 0) > 0
    const onScroll = (e: Event) => {
      const el = e.target as Element
      if (el === main || el.classList.contains('home')) setScrolled(read(el))
    }
    main.addEventListener('scroll', onScroll, { capture: true, passive: true })
    setScrolled(read(main) || read(main.querySelector('.home')))
    return () => main.removeEventListener('scroll', onScroll, { capture: true })
  }, [view])

  /**
   * A new view takes focus at its title, so a screen reader announces where it
   * landed and Tab starts from the top of it rather than from <body>. Not on
   * first load: the browser puts a fresh page at the top already.
   */
  const focusedView = useRef(view)
  useEffect(() => {
    if (focusedView.current === view) return
    focusedView.current = view
    const target = document.querySelector<HTMLElement>('#main h1, #view-title')
      ?? document.getElementById('main')
    target?.focus()
  }, [view])

  // Home's own failure state already says this, with its own Try again.
  const bootFailed = view === 'home' && !taxonomy.length && !taxonomyLoading
  const banner = error && !bootFailed ? (
    <ErrorBanner message={error.message}
                 onRetry={error.retry ? () => { setError(null); error.retry?.() } : undefined}
                 onDismiss={() => setError(null)} />
  ) : null

  if (view !== 'practice') {
    const pages: Record<Exclude<View, 'practice'>, () => ReactNode> = {
      home: () => (
        <Home taxonomy={taxonomy} taxonomyLoading={taxonomyLoading} onRetryBoot={retryBoot}
              facet={filters.difficulties?.length || filters.statuses?.length ? facetItems : null}
              stats={stats} history={attemptLog} value={filters} items={items}
              findIds={findIds} onOpenId={practiceOne}
              loading={listLoading} onChange={setFilters}
              onOpen={(i) => { setIndex(i); navigate('practice') }}
              order={order}
              onOrder={(next) => {
                setOrder(next)
                if (next === 'random') setSeed(crypto.randomUUID())
              }}
              activeSets={activeSets}
              onResume={openSet}
              onAbandon={abandonSet}
              onStart={startSet}
              onQuickStart={quickSet}
              onScoreCheck={scoreCheck} />
      ),
      resources: () => <Resources />,
      inbox: () => <Inbox />,
      about: () => <About />,
      settings: () => <Settings />,
      results: () => (shownSet ? (
        <SetResults set={shownSet}
                    history={attemptLog}
                    onPractice={practiceOne}
                    onPracticeMany={practiceMany}
                    onRedo={redoSet}
                    onDelete={dropSet}
                    onDone={() => { setShownSet(null); navigate('review') }} />
      ) : null),
      review: () => (
        <Review onPractice={practiceOne} onPracticeMany={practiceMany} onOpenSet={showSet}
                onDeleteSet={dropSet} />
      ),
      stats: () => <StatsPage taxonomy={taxonomy} onPractice={practiceFilters} />,
    }
    // Results is the end of a set, read back from Review, so Review stays lit.
    const current = view === 'results' ? 'review' : view
    return (
      <div className="shell">
        <a className="skiplink" href="#main" onClick={skipTo('main')}>Skip to content</a>
        <nav className={scrolled ? 'tabs scrolled' : 'tabs'} aria-label="Main">
          <div className="tabs-inner">
            <button className="brand" onClick={() => navigate('home')} aria-label="LightBluePrep home">
              <Mark size={28} />
              <span className="wordmark">Light<span className="wordmark-blue">Blue</span>Prep</span>
            </button>
            <div className="tablinks">
              {NAV.map((t) => (
                <button key={t.key}
                        className={current === t.key ? 'tab on' : 'tab'}
                        title={t.label} aria-label={t.label}
                        aria-current={current === t.key ? 'page' : undefined}
                        onClick={() => navigate(t.key)}>
                  <span className="tab-ico"><Icon name={t.icon} size={18} strokeWidth={2} /></span>
                  <span className="tab-label">{t.label}</span>
                </button>
              ))}
            </div>
            {/*
              In the nav rather than in a page corner, so every page shows them
              from one instance. The practice view renders its own header and
              deliberately does not get them.
            */}
            <div className="navright">
              <button className="navicon" onClick={() => navigate('settings')}
                      aria-label="Settings" title="Settings"
                      aria-current={view === 'settings' ? 'page' : undefined}>
                <Icon name="gear" size={20} strokeWidth={2} />
              </button>
              <GithubLink />
              <SupportLink />
              <AccountBadge />
            </div>
          </div>
        </nav>
        {banner}
        {/* Home scrolls inside its own .home, so its main only passes the height down. */}
        <main id="main" tabIndex={-1} className={view === 'home' ? 'page page-home' : 'page'}>
          {pages[view]()}
          {/* Home scrolls inside .home, so it renders its own footer in there. */}
          {view === 'home' ? null : <Footer context={view} />}
        </main>
        <FeedbackHost />
        <SupportHost />
      </div>
    )
  }

  return (
    <div className="app">
      <a className="skiplink" href="#question" onClick={skipTo('question')}>Skip to question</a>
      <header className="topbar">
        <div className="topbar-left">
          <div className="section-title">
            <button className="backbtn" title="Go back" aria-label="Go back"
                    onClick={leavePractice}>
              <Icon name="chevron-left" size={18} strokeWidth={2.2} />
            </button>
            {/* Wrapped so it can be truncated on a phone. A bare text node in a
                flex row cannot take text-overflow. */}
            <span className="section-name" id="view-title" tabIndex={-1}
                  role="heading" aria-level={1}>{setTitle}</span>
          </div>
          <button className="ghostlink" onClick={() => setShowDirections((v) => !v)}>
            Directions
            <Icon name={showDirections ? 'chevron-up' : 'chevron-down'} size={15}
                  strokeWidth={2.2} />
          </button>
        </div>

        <div className="topbar-center">
          {/* A timed set counts the whole set down, the way a module does on the
              day. Untimed practice keeps the per-question stopwatch it had. */}
          <div className={
            (showTimer ? 'clock' : 'clock is-hidden')
            + (remaining !== null && remaining <= 60 ? ' is-low' : '')
          }>
            {!showTimer ? '···'
              : formatClock(remaining ?? seconds)}
          </div>
          <button className="hide-btn" onClick={() => setShowTimer((v) => !v)}>
            {showTimer ? 'Hide' : 'Show'}
          </button>
        </div>

        <div className="topbar-right">
          {question ? <QuestionInfo question={question} /> : null}
          {section === 'MATH' ? (
            <button className={showReference ? 'tool on' : 'tool'} aria-label="Reference"
                    onClick={() => setShowReference((v) => !v)}>
              <span className="tool-glyphs"><Icon name="ruler" size={21} /></span>
              <span className="tool-label"><span className="tool-text">Reference</span></span>
            </button>
          ) : null}
          {section === 'MATH' && DESMOS_EMBEDDED ? (
            <button className={showDesmos ? 'tool on' : 'tool'} aria-label="Calculator"
                    onClick={() => setShowDesmos((v) => !v)}>
              <span className="tool-glyphs"><Icon name="calculator" size={21} /></span>
              <span className="tool-label"><span className="tool-text">Calculator</span></span>
            </button>
          ) : null}
          {section === 'MATH' && !DESMOS_EMBEDDED ? (
            // No API key of our own yet: hand off to Desmos's free calculator
            // site rather than embedding it.
            <a className="tool" href="https://www.desmos.com/calculator" target="_blank" rel="noreferrer" aria-label="Calculator"
               title="Opens the Desmos graphing calculator in a new tab">
              <span className="tool-glyphs"><Icon name="calculator" size={21} /></span>
              <span className="tool-label"><span className="tool-text">Calculator</span></span>
            </a>
          ) : null}
          <button className={showNotes ? 'tool on' : 'tool'}
                  onClick={() => setShowNotes((v) => !v)}>
            <span className="tool-glyphs">
              <Icon name="highlighter" size={21} />
              <Icon name="note" size={20} />
            </span>
            {/* `has-count` so a phone can drop the label AND the wrapper when
                there is nothing left inside it. Hiding only the words leaves an
                empty flex item that still eats the row gap, which pushed the
                glyphs half a pixel off the bar's centre. */}
            <span className={annotations.length ? 'tool-label has-count' : 'tool-label'}>
              <span className="tool-text">Highlights &amp; Notes</span>
              {annotations.length ? ` (${annotations.length})` : ''}
            </span>
          </button>
          <div className="tool static">
            <span className="tool-glyphs"><Icon name="check" size={21} /></span>
            <span>
              {stats && stats.attempts
                ? `${stats.correct}/${stats.attempts}`
                : '0/0'}
            </span>
          </div>
        </div>
      </header>

      {banner}

      <main id="question" tabIndex={-1}
            className={desmosSplit === null ? 'main' : 'main is-split-tool'}
            style={desmosSplit === null
              ? undefined
              : ({ '--tool-split': `${desmosSplit}%` } as React.CSSProperties)}>
        {loading ? <div className="placeholder">Loading question…</div> : null}
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
              onRespond={(value) => {
                setResponse(value)
                if (activeSet) holdAnswer(value, seconds)
              }}
              onSubmit={submit}
              onToggleFlag={toggleFlag}
              onToggleCrossOutMode={() => setCrossOutMode((v) => !v)}
              onToggleCrossOut={toggleCrossOut}
              onAddAnnotation={(a) => persistAnnotations([...annotations, a as Annotation])}
              onRemoveAnnotation={(id) =>
                persistAnnotations(annotations.filter((a) => a.id !== id))}
              mistake={mistake}
              onSaveMistake={(tags, note) => {
                void api.saveMistake(current.id, tags, note)
                  .then((r) => setMistake(r.mistake))
                  .catch((e: Error) => fail(e))
              }}
            />
          </ErrorBoundary>
        ) : null}
        {showDesmos && DESMOS_EMBEDDED ? (
          <Desmos onClose={() => setShowDesmos(false)}
                  onExpandedChange={setDesmosSplit} />
        ) : null}
      </main>

      <footer className="bottombar">
        <div className="bottom-left">LightBluePrep</div>
        <div className="bottom-mid">
          <button className="navbtn" onClick={() => setShowNavigator(true)}
                  disabled={!items.length}>
            Question {items.length ? index + 1 : 0} of {items.length.toLocaleString()}
            <Icon name="chevron-up" size={15} strokeWidth={2.2} />
          </button>
        </div>
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
      </footer>

      {showNavigator ? (
        <Navigator items={items} current={index} title={setTitle}
                   onGo={go} onClose={() => setShowNavigator(false)}
                   states={setStates}
                   complete={setComplete}
                   onReviewPage={activeSet ? () => {
                     setShowNavigator(false); setShowSetReview(true)
                   } : undefined} />
      ) : null}

      {showSetReview && activeSet ? (
        <SetReview items={items} current={index} title={setTitle}
                   states={setStates}
                   remaining={remaining}
                   clock={remaining === null ? null : formatClock(remaining)}
                   onGo={go}
                   onClose={() => setShowSetReview(false)}
                   onFinish={finishSet} />
      ) : null}

      {showReference ? <ReferenceSheet onClose={closeReference} /> : null}

      {showNotes ? (
        <Notes annotations={annotations}
               onRemove={(id) => persistAnnotations(annotations.filter((a) => a.id !== id))}
               onClose={() => setShowNotes(false)} />
      ) : null}

      {showDirections ? (
        <>
          <div className="dir-scrim" onClick={() => setShowDirections(false)} />
          <div className="dir-sheet" role="dialog" aria-label="Directions">
            <div className="dir-body">
              {DIRECTIONS[section].map((line) => <p key={line}>{line}</p>)}
            </div>
            <div className="dir-foot">
              <button className="btn primary" onClick={() => setShowDirections(false)}>
                Close
              </button>
            </div>
          </div>
        </>
      ) : null}
      <FeedbackHost />
      <SupportHost />
    </div>
  )
}

import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import * as api from './api'
import { ErrorBanner } from './components/ErrorBanner'
import { ErrorBoundary } from './components/ErrorBoundary'
import { FeedbackHost } from './components/Feedback'
import { Footer } from './components/Footer'
import { Home } from './components/Home'
import { InstallBar } from './components/InstallBar'
import { PracticeScreen } from './components/PracticeScreen'
import { SupportHost } from './components/Support'
import { SkipLink, TopNav } from './components/TopNav'
import { sample } from './lib/draw'
import { toUserMessage } from './lib/errors'
import { SECTION_NAME, skillDisplayName } from './lib/labels'
import { arrange } from './lib/order'
import { About, Inbox, PlanPage, Resources, Review, SetResults, Settings, StatsPage, warmPages } from './lib/pages'
import { nextPart, patchPart, patchSession, putSession, type PlanSession } from './lib/plan'
import { loadProcessTypes } from './lib/similar'
import type { View } from './lib/route'
import { loadStudy, savePlan } from './lib/study'
import * as sync from './lib/sync'
import { usePracticeSet } from './lib/usePracticeSet'
import { useProgress } from './lib/useProgress'
import { useQuestionList } from './lib/useQuestionList'
import { useDeepLinks, useRoute } from './lib/useRoute'
import type { Filters, SetItem } from './types'

/**
 * What a lazy page shows while its chunk loads: nothing, so a fast load does
 * not flash a placeholder. Unmounting is the moment the page has arrived.
 */
function PageWait({ onDone }: { onDone: () => void }) {
  useEffect(() => onDone, [onDone])
  return <div aria-busy="true" />
}

export default function App() {
  /** Asked by Back and Forward before the view changes: the set's, once it exists below. */
  const beforePop = useRef<(from: View) => boolean>(() => false)
  const { view, viewRef, practiceFrom, navigate, refocusTitle } = useRoute(beforePop)
  useEffect(warmPages, [])

  const [error, setError] = useState<{ message: string; retry?: () => void } | null>(null)
  /** Every failure the app shows goes through here, never a raw message. */
  const fail = useCallback((e: unknown, retry?: () => void) => {
    setError({ message: toUserMessage(e), retry })
  }, [])

  /** Bumped by a sync that pulled rows; reloads Home's list and sets. */
  const [dataVersion, setDataVersion] = useState(0)
  // Starts the sync loop if a session already exists. No-op when signed out or
  // when the build has no sync configured, so the localhost path is untouched.
  useEffect(() => { sync.start() }, [])
  // A pull from another device changes the same numbers an answer does.
  useEffect(() => sync.subscribe(() => setDataVersion(sync.getDataVersion())), [])

  const list = useQuestionList({ view, dataVersion, fail })
  const { filters, setFilters, items, setItems, index, setIndex, order, seed, loadList } = list
  const { taxonomy, taxonomyLoading, stats, setStats, attemptLog, reload } = useProgress(view, fail, list.onFirstStats)
  const set = usePracticeSet({ view, items, index, setItems, setIndex, navigate, fail, dataVersion })
  const { start, shownSet, setShownSet } = set
  useEffect(() => { beforePop.current = set.beforePop }, [set.beforePop])

  /** Title for a list opened from Review ("Review: Incorrect"). */
  const [listTitle, setListTitle] = useState<string | null>(null)
  // oxlint-disable-next-line react/set-state-in-effect -- resets on leaving practice
  useEffect(() => { if (view !== 'practice') setListTitle(null) }, [view])

  const practiceMany = useCallback((ids: string[], title: string) => {
    api.questionsById().then((byId) => {
      const picked = ids.flatMap((id) => byId.get(id) ?? [])
      if (!picked.length) return
      setItems(picked); setIndex(0); setListTitle(title); navigate('practice')
    }).catch((e: Error) => fail(e))
  }, [setItems, setIndex, fail, navigate])

  /**
   * Where a single question was opened from, so its footer can say "Back to
   * Review" rather than a bare "Done".
   */
  const [oneFrom, setOneFrom] = useState<View | null>(null)

  /**
   * Open one question on its own, from Review. The set becomes just that
   * question, so Back and Next have nowhere to wander and the navigator says
   * 1 of 1.
   */
  const practiceOne = useCallback((id: string) => {
    // Named after the question itself: the Home filters it fell back to said
    // "All questions" over "Question 1 of 1".
    const open = (one: SetItem) => {
      setItems([one]); setIndex(0)
      const skill = skillDisplayName(one.skill, one.skill_name ?? '')
      setListTitle(skill ? `${SECTION_NAME[one.section]}: ${skill}` : `Question ${one.cb_id ?? ''}`.trim())
      setOneFrom(viewRef.current)
      navigate('practice')
    }
    const found = items.find((i) => i.id === id)
    if (found) { open(found); return }
    api.questionsById().then((byId) => {
      const one = byId.get(id)
      if (one) open(one)
    }).catch((e: Error) => fail(e))
  }, [items, setItems, setIndex, viewRef, fail, navigate])

  /**
   * Practice a filter straight from Stats. The list is loaded first and then
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
      // These become Home's stored picks (and the pool loadList draws), so
      // keep the session length and timer chosen there: neither changes the pool.
      setFilters((prev) => ({
        size: prev.size, speed: prev.speed,
        ...(next.skills?.length === 1 && !next.section ? { ...next, section: d.questions[0]!.section } : next),
      }))
      // Its title comes from these filters, not from a list opened before it.
      setListTitle(null)
      setItems(arrange(d.questions, order, seed)); setIndex(0); navigate('practice')
    }).catch((e: Error) => fail(e))
  }, [order, seed, setFilters, setItems, setIndex, fail, navigate])

  useDeepLinks({ practiceOne, practiceFilters, scoreCheck: set.scoreCheck, fail })

  /** Home's "Try again" when the first load failed: the topics and the pool both. */
  const retryBoot = useCallback(() => { setError(null); reload(); loadList() }, [reload, loadList])

  const startSet = useCallback(async () => {
    if (!filters.size) { setIndex(0); navigate('practice'); return }
    // Names go in with the set so it can still say what it covers if a later
    // build no longer knows one of these skill codes.
    const skill_names = filters.skills?.map((code) =>
      taxonomy.find((r) => r.skill === code)?.skill_name ?? code)
    await start(sample(items, filters.size), skill_names ? { ...filters, skill_names } : filters)
  }, [filters, items, taxonomy, start, setIndex, navigate])

  /**
   * Start a plan session as a practice set, and link the set to the session so
   * finishing it ticks the session off. The baseline is the balanced Score
   * check; a review with nothing missed yet falls back to new questions.
   */
  const startPlanSession = useCallback(async (s: PlanSession, ref?: string) => {
    try {
      // A day of process types: one type at a time, each its own set. With no
      // type named, the next one not yet done.
      if (s.parts?.length) {
        const part = ref ? s.parts.find((p) => p.ref === ref) : nextPart(s)
        if (!part) return
        if (part.set_id && set.activeSets.some((a) => a.id === part.set_id)) { set.open(part.set_id); return }
        const d = await api.questionSet({ section: undefined, skills: [part.skill], types: [part.ref], statuses: ['unseen'] })
        if (!d.questions.length) { setError({ message: `No unanswered ${part.label} questions are left.` }); return }
        const id = await start(d.questions.slice(0, part.n), {
          skills: [part.skill], types: [part.ref], statuses: ['unseen'], size: part.n,
          title: part.label, skill_names: [part.skillName],
        })
        if (!id) return
        const study = await loadStudy()
        if (study.plan) await savePlan(patchPart(study.plan, s.id, part.ref, { set_id: id }))
        return
      }
      // Already started and not finished: carry on with that set, not a second one.
      if (s.set_id && set.activeSets.some((a) => a.id === s.set_id)) { set.open(s.set_id); return }
      let id: string | null
      if (s.phase === 'baseline') id = await set.scoreCheck()
      else {
        const { size = 10, speed, title: _title, skill_names: _names, ...pool } = s.filters
        let d = await api.questionSet(pool)
        if (!d.questions.length && s.phase === 'review') d = await api.questionSet({ statuses: ['unseen'] })
        if (!d.questions.length) { setError({ message: 'No questions match this session. Edit it on the Plan page.' }); return }
        const skill_names = pool.skills?.map((code) => taxonomy.find((r) => r.skill === code)?.skill_name ?? code)
        let chosen = sample(d.questions, size)
        if (s.phase === 'cover') {
          // Clearing the bank goes type by type in the planned order, so the
          // days fit together; within a type, bank order.
          const pt = await loadProcessTypes()
          const rank = new Map((pool.types ?? []).map((ref, i) => [ref, i]))
          const at = (q: SetItem) => rank.get((q.cb_id && pt?.q[q.cb_id]) || '') ?? rank.size
          chosen = d.questions.map((q, i) => ({ q, i }))
            .sort((a, b) => at(a.q) - at(b.q) || a.i - b.i).slice(0, size).map((x) => x.q)
        }
        id = await start(chosen, {
          ...pool, size,
          ...(speed ? { speed } : {}),
          ...(s.phase === 'build' && !s.parts ? {} : { title: s.title }),
          ...(skill_names ? { skill_names } : {}),
        })
      }
      if (!id) return
      const study = await loadStudy()
      if (study.plan) await savePlan(patchSession(study.plan, s.id, { set_id: id }))
    } catch (e) { fail(e) }
  }, [set, start, taxonomy, fail])

  /**
   * Planning mode: Home's topic picker chooses a plan session's topics and
   * types instead of starting practice. Home's own picks are kept aside in
   * `saved` and put back when the session is added or the planning is dropped.
   */
  const [planDraft, setPlanDraft] = useState<{ session: PlanSession | null; date: string; saved: Filters } | null>(null)
  const planOnHome = useCallback((session: PlanSession | null, date: string) => {
    setPlanDraft((d) => ({ session, date, saved: d?.saved ?? filters }))
    // A session's own picks; a new one starts from every question.
    const { title: _t, skill_names: _n, ...picks } = session?.filters ?? {}
    setFilters(session ? { ...picks, size: 0 } : { size: 0 })
    navigate('home')
  }, [filters, setFilters, navigate])
  const endPlanning = useCallback(() => {
    if (planDraft) setFilters(planDraft.saved)
    setPlanDraft(null)
    navigate('plan')
  }, [planDraft, setFilters, navigate])
  const addPlanSession = useCallback(async (s: Omit<PlanSession, 'id' | 'date'>, date: string) => {
    try {
      const study = await loadStudy()
      if (!study.plan) { endPlanning(); return }
      const prev = planDraft?.session
      await savePlan(putSession(study.plan, {
        ...(prev ?? {}), ...s, id: prev?.id ?? crypto.randomUUID(), date,
        // New topics start the session over: an old set is not this session.
        set_id: undefined, done_at: undefined,
      }))
      endPlanning()
    } catch (e) { fail(e) }
  }, [planDraft, endPlanning, fail])

  // Home's own failure state already says this, with its own Try again.
  const bootFailed = view === 'home' && !taxonomy.length && !taxonomyLoading
  const banner = error && !bootFailed ? (
    <ErrorBanner message={error.message}
                 onRetry={error.retry ? () => { setError(null); error.retry?.() } : undefined}
                 onDismiss={() => setError(null)} />
  ) : null

  if (view === 'practice') {
    return (
      <PracticeScreen set={set} items={items} setItems={setItems} index={index} setIndex={setIndex}
                      filters={filters} listTitle={listTitle} oneFrom={oneFrom} practiceFrom={practiceFrom}
                      stats={stats} onStats={setStats} banner={banner} fail={fail} navigate={navigate}
                      practiceFilters={practiceFilters} practiceMany={practiceMany} />
    )
  }

  const pages: Record<Exclude<View, 'practice'>, () => ReactNode> = {
    home: () => (
      <Home taxonomy={taxonomy} taxonomyLoading={taxonomyLoading} onRetryBoot={retryBoot}
            facet={list.facet}
            stats={stats} history={attemptLog} value={filters} items={items}
            findIds={api.findByCbId} onOpenId={practiceOne}
            loading={list.listLoading} onChange={setFilters}
            onOpen={(i) => { setIndex(i); navigate('practice') }}
            order={order}
            onOrder={list.reorder}
            activeSets={set.activeSets}
            onResume={set.open}
            onAbandon={set.drop}
            onStart={startSet}
            onStartPlan={(s) => { void startPlanSession(s) }}
            planning={planDraft ? { date: planDraft.date, editing: Boolean(planDraft.session) } : null}
            onPlanDate={(date) => setPlanDraft((d) => (d ? { ...d, date } : d))}
            onPlanAdd={(s, date) => { void addPlanSession(s, date) }}
            onPlanCancel={endPlanning}
            onScoreCheck={set.scoreCheck} />
    ),
    plan: () => (
      <PlanPage taxonomy={taxonomy} history={attemptLog} onStartSession={(s, ref) => { void startPlanSession(s, ref) }}
                onPickTopics={planOnHome} />
    ),
    resources: () => <Resources />,
    inbox: () => <Inbox />,
    about: () => <About taxonomy={taxonomy} />,
    settings: () => <Settings />,
    results: () => (shownSet ? (
      <SetResults set={shownSet}
                  history={attemptLog}
                  onPractice={practiceOne}
                  onPracticeMany={practiceMany}
                  onRedo={set.redo}
                  onDelete={set.drop}
                  onDone={() => { setShownSet(null); navigate('review') }} />
    ) : null),
    review: () => (
      <Review onPractice={practiceOne} onPracticeMany={practiceMany} onOpenSet={set.show}
              onDeleteSet={set.drop} onStart={() => navigate('home')} />
    ),
    stats: () => <StatsPage taxonomy={taxonomy} history={attemptLog} onPractice={practiceFilters} onStart={set.quick} />,
  }
  return (
    <div className="shell">
      <SkipLink to="main">Skip to content</SkipLink>
      <TopNav view={view} navigate={navigate} />
      {banner}
      <InstallBar answered={stats?.attempts ?? 0} />
      {/* Home scrolls inside its own .home, so its main only passes the height down. */}
      <main id="main" tabIndex={-1} className={view === 'home' ? 'page page-home' : 'page'}>
        {/* Keyed by view: a page whose chunk failed to load (offline, or a
            deploy replaced it) shows Bulb in the page, and the next page
            starts clean. */}
        <ErrorBoundary key={view} context={`page:${view}`} onReset={() => navigate('home')}>
          <Suspense fallback={<PageWait onDone={refocusTitle} />}>
            {pages[view]()}
            {/* Home scrolls inside .home, so it renders its own footer in there. */}
            {view === 'home' ? null : <Footer context={view} />}
          </Suspense>
        </ErrorBoundary>
      </main>
      <FeedbackHost />
      <SupportHost />
    </div>
  )
}

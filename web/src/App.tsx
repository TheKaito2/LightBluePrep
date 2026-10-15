import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import * as api from './api'
import { ErrorBanner } from './components/ErrorBanner'
import { ErrorBoundary } from './components/ErrorBoundary'
import { FeedbackHost } from './components/Feedback'
import { Footer } from './components/Footer'
import { Home } from './components/Home'
import { PracticeScreen } from './components/PracticeScreen'
import { SupportHost } from './components/Support'
import { SkipLink, TopNav } from './components/TopNav'
import { sample } from './lib/draw'
import { toUserMessage } from './lib/errors'
import { SECTION_NAME, skillDisplayName } from './lib/labels'
import { arrange } from './lib/order'
import { About, Inbox, Resources, Review, SetResults, Settings, StatsPage, warmPages } from './lib/pages'
import type { View } from './lib/route'
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

  useDeepLinks({ practiceOne, practiceFilters, fail })

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
            onQuickStart={set.quick}
            onScoreCheck={set.scoreCheck} />
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
    stats: () => <StatsPage taxonomy={taxonomy} onPractice={practiceFilters} onStart={set.quick} />,
  }
  return (
    <div className="shell">
      <SkipLink to="main">Skip to content</SkipLink>
      <TopNav view={view} navigate={navigate} />
      {banner}
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

/**
 * Which screen is showing, kept in step with history (lib/route.ts maps it to
 * the address bar), plus the links into the app that open practice.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import * as api from '../api'
import { parseHash, titleFor, urlFor, type View } from './route'
import type { Filters } from '../types'

/** Links into the app that open practice; they win over Home's stored picks. */
const DEEP_LINK_KEYS = ['q', 'skill', 'type']
export const hasDeepLink = () => DEEP_LINK_KEYS.some((k) => new URLSearchParams(window.location.search).has(k))

/** index.html's own title, which Home goes back to. */
const HOME_TITLE = document.title

/**
 * `beforePop(from)` runs first when Back, Forward or a hash link (the account
 * panel's #inbox) changes the view, and says whether Results can come back:
 * only while its set is still in memory. Anything else the URL names.
 */
export function useRoute(beforePop: RefObject<(from: View) => boolean>) {
  // A deep link (?q, ?skill, ?type) wins over the hash: it opens practice
  // from Home below, so Back from it lands on Home.
  const [view, setView] = useState<View>(() => (hasDeepLink() ? 'home' : parseHash(window.location.hash)))
  const viewRef = useRef(view)
  useEffect(() => { viewRef.current = view }, [view])
  /** The page under practice, which is where its back button goes. */
  const [practiceFrom, setPracticeFrom] = useState<View>('home')

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
    if (next === 'practice' && viewRef.current !== 'practice') setPracticeFrom(viewRef.current)
    setView(next)
  }, [])

  useEffect(() => {
    const follow = () => {
      const results = beforePop.current(viewRef.current) && history.state?.view === 'results'
      setView(results ? 'results' : parseHash(window.location.hash))
    }
    window.addEventListener('popstate', follow)
    window.addEventListener('hashchange', follow)
    return () => {
      window.removeEventListener('popstate', follow)
      window.removeEventListener('hashchange', follow)
    }
  }, [beforePop])

  // The practice screen names its own tab, after the question and the set.
  useEffect(() => {
    if (view !== 'practice') document.title = titleFor(view, HOME_TITLE)
  }, [view])

  /**
   * A new view takes focus at its title, so a screen reader announces where it
   * landed and Tab starts from the top of it rather than from <body>. Not on
   * first load: the browser puts a fresh page at the top already.
   */
  const focusedView = useRef(view)
  const titlePending = useRef(false)
  useEffect(() => {
    if (focusedView.current === view) return
    focusedView.current = view
    // Where the document scrolls (phones), every view shares one scroll
    // position: a new one starts at its top, not wherever the last one was.
    window.scrollTo(0, 0)
    const title = document.querySelector<HTMLElement>('#main h1, #view-title')
    // A page still fetching its chunk has no title yet: refocusTitle hands
    // focus on once it arrives.
    titlePending.current = !title
    ;(title ?? document.getElementById('main'))?.focus()
  }, [view])
  const refocusTitle = useCallback(() => {
    if (!titlePending.current) return
    titlePending.current = false
    // Unless the student has moved on from where focus was parked.
    if (document.activeElement !== document.getElementById('main')) return
    document.querySelector<HTMLElement>('#main h1, #view-title')?.focus()
  }, [])

  return { view, viewRef, practiceFrom, navigate, refocusTitle }
}

/**
 * Links into the app: ?q=<College Board ID> opens that question, ?skill=<code>
 * practises a skill and ?type=<skill.key> one question type. They come from
 * Info's Link button, video descriptions and the static /skills pages. Read
 * once on load, then dropped from the address bar (with any hash) so a reload
 * lands on Home, and so does Back: Home is the entry practice is pushed over.
 */
export function useDeepLinks({ practiceOne, practiceFilters, fail }: {
  practiceOne: (id: string) => void
  practiceFilters: (filters: Filters) => void
  fail: (e: unknown) => void
}) {
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
      api.findByCbId(q).then(({ hits }) => {
        if (hits[0]?.cb_id?.toLowerCase() === q) practiceOne(hits[0].id)
      }).catch((e: Error) => fail(e))
    } else if (type?.includes('.')) {
      practiceFilters({ skills: [type.slice(0, type.lastIndexOf('.'))], types: [type] })
    } else if (skill) {
      practiceFilters({ skills: [skill] })
    }
    // Once, on load: these callbacks change identity as the list loads, and
    // re-running would reopen the link every time.
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- once, on load: see above
  }, [fail])
}

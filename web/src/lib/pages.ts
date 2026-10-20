/**
 * The screens a first paint of Home never needs, each its own chunk (PF-13),
 * and the practice overlays.
 */
import { lazy } from 'react'
import { DESMOS_EMBEDDED } from './desmos'
import { whenIdle } from './idle'
import type { View } from './route'

/**
 * import() is cached per module, so the same loaders double as prefetches:
 * a nav tab warms its page on hover or focus, before the click lands.
 */
const PAGE_CHUNKS = {
  plan: () => import('../components/Plan'),
  review: () => import('../components/Review'),
  stats: () => import('../components/Stats'),
  resources: () => import('../components/Resources'),
  about: () => import('../components/About'),
  settings: () => import('../components/Settings'),
  inbox: () => import('../components/Inbox'),
  results: () => import('../components/SetResults'),
}
// A failed prefetch is not an error: the click retries it.
export const prefetchPage = (view: View) => {
  void (PAGE_CHUNKS as Partial<Record<View, () => Promise<unknown>>>)[view]?.().catch(() => {})
}

/**
 * A chunk that will not load gets one reload. The usual cause is a tab left
 * open across a deploy, asking for chunk names the deploy replaced; a reload
 * fetches the new index.html. Not offline, and at most once a minute, so a
 * chunk missing for any other reason reaches the page's error state instead
 * of a reload loop.
 */
function chunk<T>(load: () => Promise<T>): Promise<T> {
  return load().catch((error: unknown) => {
    const KEY = 'lbp.chunkReload'
    let last = 0
    try { last = Number(sessionStorage.getItem(KEY)) || 0 } catch { /* storage blocked */ }
    if (!navigator.onLine || Date.now() - last < 60_000) throw error
    try { sessionStorage.setItem(KEY, String(Date.now())) } catch { throw error }
    window.location.reload()
    return new Promise<T>(() => {})
  })
}

export const PlanPage = lazy(() => chunk(PAGE_CHUNKS.plan).then((m) => ({ default: m.Plan })))
export const Review = lazy(() => chunk(PAGE_CHUNKS.review).then((m) => ({ default: m.Review })))
export const StatsPage = lazy(() => chunk(PAGE_CHUNKS.stats).then((m) => ({ default: m.Stats })))
export const Resources = lazy(() => chunk(PAGE_CHUNKS.resources).then((m) => ({ default: m.Resources })))
export const About = lazy(() => chunk(PAGE_CHUNKS.about).then((m) => ({ default: m.About })))
export const Settings = lazy(() => chunk(PAGE_CHUNKS.settings).then((m) => ({ default: m.Settings })))
export const Inbox = lazy(() => chunk(PAGE_CHUNKS.inbox).then((m) => ({ default: m.Inbox })))
export const SetResults = lazy(() => chunk(PAGE_CHUNKS.results).then((m) => ({ default: m.SetResults })))
// Practice overlays, warmed with the rest once the first screen is idle.
const loadReference = () => import('../components/ReferenceSheet')
const loadDesmos = () => import('../components/Desmos')
const loadSetReview = () => import('../components/SetReview')
export const ReferenceSheet = lazy(() => chunk(loadReference).then((m) => ({ default: m.ReferenceSheet })))
export const Desmos = lazy(() => chunk(loadDesmos).then((m) => ({ default: m.Desmos })))
export const SetReview = lazy(() => chunk(loadSetReview).then((m) => ({ default: m.SetReview })))

/**
 * The rest of the app, once the first screen is idle: a few KB each, and
 * fetched while online they are what lets every page open offline later
 * (public/sw.js caches them on the way through). Returns the cancel.
 */
export const warmPages = () => whenIdle(() => {
  const loads: (() => Promise<unknown>)[] = [...Object.values(PAGE_CHUNKS), loadReference, loadSetReview]
  if (DESMOS_EMBEDDED) loads.push(loadDesmos)
  // A miss here costs nothing now: opening that page fetches it again.
  for (const load of loads) void load().catch(() => {})
}, 8000)

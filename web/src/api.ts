/**
 * Picks the data backend. Everything in the app goes through this module, and
 * nothing else touches the network or storage.
 *
 *   apiHttp   localhost. The Python server owns SQLite, does the grading, and
 *             withholds the answer key until you answer. Pulls the whole bank
 *             up front, which is fine because it is local.
 *   apiLocal  Cloudflare Pages. No server: fetches College Board directly, caches
 *             in IndexedDB, grades in the browser. Loads the index up front
 *             (~1.7s) and question bodies on demand.
 *
 * Chosen at BUILD time via VITE_BACKEND, not by probing at runtime: a runtime
 * probe costs a failed request and a race on every cold load.
 *
 *   npm run build         -> http   (default)
 *   npm run build:pages   -> local
 *
 * In development, `?backend=local` or `?backend=http` overrides it for one page
 * load, so the static path can be exercised against a dev server without a
 * separate build. Never in production: on Pages there is no /api/*, and a
 * shared link carrying `?backend=http` would break every call.
 *
 * The two backends do NOT share progress. Answering on Pages does not appear on
 * localhost. That is deliberate.
 */
import * as http from './apiHttp'
import * as local from './apiLocal'
import { filterByTypes, loadProcessTypes } from './lib/similar'
import { skillDisplayName } from './lib/labels'
import * as sync from './lib/sync'
import type { Backend, Filters, SetItem } from './types'

export type BackendName = 'http' | 'local'

function choose(): BackendName {
  if (import.meta.env.DEV) {
    const override = new URLSearchParams(window.location.search).get('backend')
    if (override === 'local' || override === 'http') return override
  }
  return import.meta.env.VITE_BACKEND === 'local' ? 'local' : 'http'
}

export const backend: BackendName = choose()

// Each checked on its own, so a drift is reported against the backend that drifted.
const backends = { local: local satisfies Backend, http: http satisfies Backend }
const impl: Backend = backends[backend]

/**
 * Counts changes to what the taxonomy, the history and the question list rows
 * are computed from: an answer, a flag, a pull from another device, a local
 * delete or a re-read index. Every one of those goes through this module, so
 * this is the one place to count them. App refetches the taxonomy and history
 * only when it moves rather than on every page switch (PF-16), and
 * questionsById() is memoised on it.
 */
let progress = 0
const progressListeners = new Set<() => void>()
function progressed() {
  progress++
  pool = null
  for (const listener of progressListeners) listener()
}
export const progressVersion = (): number => progress
export function onProgress(listener: () => void): () => void {
  progressListeners.add(listener)
  return () => { progressListeners.delete(listener) }
}
// Sync also emits on status changes; only a pull that wrote rows counts.
let pulled = sync.getDataVersion()
sync.subscribe(() => {
  if (sync.getDataVersion() === pulled) return
  pulled = sync.getDataVersion()
  progressed()
})

/** Bump the progress version once `work` has finished, whether or not it succeeded. */
function counted<A extends unknown[], R>(work: (...args: A) => Promise<R>) {
  return (...args: A): Promise<R> => work(...args).finally(progressed)
}

/**
 * Skill names leave here in the app's own spelling (lib/labels.ts), whichever
 * backend or cached copy they came from, so no page has to remember to tidy
 * College Board's mixed casing.
 */
function named<T extends { skill: string; skill_name: string }>(row: T): T {
  return { ...row, skill_name: skillDisplayName(row.skill, row.skill_name) }
}

export async function taxonomy() {
  const d = await impl.taxonomy()
  return { ...d, taxonomy: d.taxonomy.map(named) }
}
/** Both backends filter the rest; process types are applied here, once. */
export async function questionSet(filters: Filters) {
  const result = await impl.questionSet(filters)
  const all = result.questions.map(named)
  if (!filters.types?.length) return { count: result.count, questions: all }
  const pt = await loadProcessTypes()
  if (!pt) return { count: result.count, questions: all }
  const questions = filterByTypes(all, filters.types, pt)
  return { count: questions.length, questions }
}
export async function question(id: string) {
  const d = await impl.question(id)
  return { ...d, question: named(d.question) }
}

let pool: Promise<Map<string, SetItem>> | null = null
/**
 * The whole bank keyed by id, in the order questionSet({}) gives it, built once
 * per progress version and shared by everything that opens a question, a set,
 * a list from Review or a set's results (PF-17). Its rows carry progress (last
 * answer, flag), which is why a progress change drops it.
 */
export function questionsById(): Promise<Map<string, SetItem>> {
  if (!pool) {
    const building = questionSet({}).then((d) => new Map(d.questions.map((q) => [q.id, q])))
    pool = building
    // A failure is not memoised: the next call tries again.
    building.catch(() => { if (pool === building) pool = null })
  }
  return pool
}

/** Questions whose College Board ID starts with `prefix`; at most 5, with the total. */
export async function findByCbId(prefix: string): Promise<{ hits: SetItem[]; total: number }> {
  const found = backend === 'local'
    ? await local.findByCbId(prefix)
    // The Python server has no search; the memoised pool is already in memory.
    : local.rankByCbId([...(await questionsById()).values()], (q) => q.cb_id, prefix)
  return { ...found, hits: found.hits.map(named) }
}

/** Warm the cache for the questions likely to be opened next. A no-op on localhost. */
export const prefetch = impl.prefetch

export const answer = counted(impl.answer)
export const flag = counted(impl.flag)
export const saveAnnotations = impl.saveAnnotations
export const explain = impl.explain
export const attemptsFor = impl.attemptsFor
export const loggedIds = impl.loggedIds
export const saveMistake = impl.saveMistake
export async function reviewed() {
  const d = await impl.reviewed()
  return { ...d, questions: d.questions.map(named) }
}
export const stats = impl.stats
export const history = impl.history

// Practice sets: a frozen, randomly drawn list of questions you work through
// and score. Both backends store them the same shape.
export const listSets = impl.listSets
export const getSet = impl.getSet
export const saveSet = impl.saveSet
export const deleteSet = impl.deleteSet

/**
 * Re-read the index from College Board. Static backend only: on localhost the
 * refresh is `python -m bluebank build`.
 */
export const refreshIndex = backend === 'local' ? counted(local.refreshIndex) : null

/**
 * Settings' local data summary and delete. Static backend only: on localhost the
 * history is the SQLite file the Python server owns.
 */
export const localDataSummary = backend === 'local' ? local.localDataSummary : null
export const deleteLocalData = backend === 'local' ? counted(local.deleteLocalData) : null

/** Settings' backup download and restore. Static backend only, like the two above. */
export const exportLocalData = backend === 'local' ? local.exportLocalData : null
export const restoreLocalData = backend === 'local' ? counted(local.restoreLocalData) : null

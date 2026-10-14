/**
 * Picks the data backend. Everything in the app goes through this module, and
 * nothing else touches the network or storage.
 *
 *   apiHttp   localhost. The Python server owns SQLite, does the grading, and
 *             withholds the answer key until you answer. Pulls the whole bank
 *             up front, which is fine because it is local.
 *   apiLocal  GitHub Pages. No server: fetches College Board directly, caches
 *             in IndexedDB, grades in the browser. Loads the index up front
 *             (~1.7s) and question bodies on demand.
 *
 * Chosen at BUILD time via VITE_BACKEND, not by probing at runtime: a runtime
 * probe costs a failed request and a race on every cold load.
 *
 *   npm run build         -> http   (default)
 *   npm run build:pages   -> local
 *
 * `?backend=local` or `?backend=http` overrides it for one page load, so the
 * static path can be exercised against a dev server without a separate build.
 *
 * The two backends do NOT share progress. Answering on Pages does not appear on
 * localhost. That is deliberate.
 */
import * as http from './apiHttp'
import * as local from './apiLocal'
import { filterByTypes, loadProcessTypes } from './lib/similar'
import { skillDisplayName } from './lib/labels'
import type { Filters } from './types'

export type BackendName = 'http' | 'local'

function choose(): BackendName {
  const override = new URLSearchParams(window.location.search).get('backend')
  if (override === 'local' || override === 'http') return override
  return import.meta.env.VITE_BACKEND === 'local' ? 'local' : 'http'
}

export const backend: BackendName = choose()

const impl = backend === 'local' ? local : http

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
export const answer = impl.answer
export const flag = impl.flag
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
export const refreshIndex = backend === 'local' ? local.refreshIndex : null

/**
 * Settings' local data summary and delete. Static backend only: on localhost the
 * history is the SQLite file the Python server owns.
 */
export const localDataSummary = backend === 'local' ? local.localDataSummary : null
export const deleteLocalData = backend === 'local' ? local.deleteLocalData : null

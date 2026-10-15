/**
 * The static backend: no server at all.
 *
 * Fetches straight from College Board, normalises and grades in the browser,
 * and keeps everything in IndexedDB. This is what runs on Cloudflare Pages.
 *
 * Loading is deliberately two-tier, and that is the whole point of the design:
 *
 *   - The INDEX is two requests and about 1.7 seconds for all 3,770 entries.
 *     It carries id, section, domain, skill, difficulty and band, which is
 *     everything the home page, the filters and the navigator need. The app is
 *     fully usable once this lands.
 *   - A question BODY is one request, fetched when you actually navigate to it
 *     and then cached forever.
 *
 * Fetching all 3,767 bodies up front is what took five minutes. It is not
 * necessary: you only ever download the questions you look at.
 *
 * Two honest limitations versus the localhost backend:
 *   1. The answer key necessarily lives in the browser. It is kept out of
 *      React state by `strip()` below, but it is in IndexedDB and anyone who
 *      wants it can read it. There is no server to withhold it.
 *   2. Progress here is entirely separate from the localhost SQLite database.
 */
import type { HistoryRow } from './lib/progress'
import { grade } from './lib/grading'
import { nowSec } from './lib/sets'
import { normaliseQuestion, type Stub } from './lib/normalize'
import { byShuffleKey } from './lib/shuffle'
import * as backup from './lib/backup'
import * as cb from './lib/cbApi'
import * as store from './lib/store'
import * as sync from './lib/sync'
import * as usage from './lib/usage'
import type {
  Annotation, Filters, GradeResult, Mistake, MistakeTag, PracticeSet, Question,
  Section, SetInput, SetItem, Stats, StoredQuestion, TaxonomyRow,
} from './types'

interface Cache {
  stubs: Stub[]
  attempts: Map<string, store.Attempt[]>
  flagged: Set<string>
  /** external_ids on an official practice test, keyed by the section they are in. */
  live: Record<Section, Set<string>>
}

let cache: Cache | null = null
let booting: Promise<Cache> | null = null

const INDEX_AGE_KEY = 'index.fetchedAt'
/**
 * How long a cached index is trusted before it is re-read in the background.
 *
 * The index is what every count in the app is derived from, including "3,767
 * questions" on Home. Without this it was fetched once, on the first ever visit,
 * and then never again: College Board could add a hundred questions and the
 * number would stay frozen on that device forever. Seven days is arbitrary but
 * the bank changes a couple of times a year, so anything in that range is fine.
 */
const INDEX_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Cached practice-test ids. Refreshed with the index rather than on its own
 * clock, because the two change together: a new practice test is what adds
 * both new questions and new live items.
 */
const LIVE_KEY = 'live.items'

const NO_LIVE: Record<Section, Set<string>> = { RW: new Set(), MATH: new Set() }

function toLive(items: cb.LiveItems | undefined): Record<Section, Set<string>> {
  if (!items) return NO_LIVE
  return { RW: new Set(items.RW), MATH: new Set(items.MATH) }
}

/**
 * Read the list, fetching it once if it has never been stored.
 *
 * A failure here is not allowed to stop a boot. The filter is a nicety and the
 * bank is entirely usable without it, so an empty list just means the checkbox
 * has nothing to remove.
 */
async function loadLive(force = false): Promise<Record<Section, Set<string>>> {
  if (!force) {
    const cached = await store.getMeta<cb.LiveItems>(LIVE_KEY)
    if (cached) return toLive(cached)
  }
  try {
    const fetched = await cb.fetchLiveItems()
    await store.setMeta(LIVE_KEY, fetched)
    return toLive(fetched)
  } catch {
    return NO_LIVE
  }
}

/** Index first, bodies later. Everything below waits on this. */
async function boot(): Promise<Cache> {
  if (cache) return cache
  if (booting) return booting
  booting = (async () => {
    let stubs = await store.loadIndex()
    const cold = !stubs.length
    if (!cold) {
      // Stale index: refresh AFTER boot resolves, never before. Blocking here
      // would put 1.7s on a cold start to pick up a change the bank makes about
      // twice a year. The new count lands on the next visit.
      const fetchedAt = (await store.getMeta<number>(INDEX_AGE_KEY)) ?? 0
      if (Date.now() - fetchedAt > INDEX_MAX_AGE_MS) {
        queueMicrotask(() => { void refreshIndex().catch(() => {}) })
      }
    }

    // All at once: the practice-test list and the progress read need nothing
    // from the index, and fetched after it they added about 0.9s to a first
    // visit (PF-04).
    const [fetched, { attempts, flagged }, live] = await Promise.all([
      cold ? cb.fetchIndex() : null, readProgress(), loadLive(),
    ])
    if (fetched) {
      stubs = fetched
      // Saved in the background. Nothing reads the stored copy this session,
      // and storing 3,770 rows took about 0.4s the topics were waiting on. If
      // it fails, the next visit simply fetches the index again.
      void store.saveIndex(stubs)
        .then(() => store.setMeta(INDEX_AGE_KEY, Date.now()))
        .catch(console.error)
    }
    cache = { stubs, attempts, flagged, live }
    return cache
  })()
  // A failed first load (offline on the very first visit) must not be cached:
  // every later call would get the same rejection until a reload.
  booting.catch(() => { booting = null })
  return booting
}

/** The two progress maps, read fresh from IndexedDB. */
async function readProgress() {
  const attempts = new Map<string, store.Attempt[]>()
  for (const attempt of await store.loadAttempts()) {
    const list = attempts.get(attempt.question_id)
    if (list) list.push(attempt)
    else attempts.set(attempt.question_id, [attempt])
  }
  for (const list of attempts.values()) list.sort((a, b) => a.answered_at - b.answered_at)

  const flagged = new Set<string>()
  for (const mark of await store.loadMarks()) {
    if (mark.flagged) flagged.add(mark.question_id)
  }
  return { attempts, flagged }
}

/**
 * Rebuild the in-memory progress maps from IndexedDB.
 *
 * Sync writes attempts and marks straight to the object stores, so without this
 * the cache below still held only what THIS tab had written: answers pulled
 * from another device were invisible to taxonomy() and stats() until a reload.
 */
export async function reloadProgress(): Promise<void> {
  if (!cache) return
  const { attempts, flagged } = await readProgress()
  cache.attempts = attempts
  cache.flagged = flagged
}

// Registered rather than imported the other way round: apiLocal already imports
// sync, and having sync import apiLocal would make the cycle real.
sync.onRemoteData(reloadProgress)

/** What this browser holds about the person, for Settings to show before deleting. */
export async function localDataSummary() {
  const [attempts, marks, annotations, mistakes, sets] = await Promise.all([
    store.loadAttempts(), store.loadMarks(), store.loadAllAnnotations(),
    store.loadAllMistakes(), store.loadSets(),
  ])
  return {
    answers: attempts.length,
    questions: new Set(attempts.map((a) => a.question_id)).size,
    marked: marks.filter((m) => m.flagged).length,
    highlights: annotations.reduce((n, a) => n + a.items.length, 0),
    mistakes: mistakes.filter((m) => !store.isEmptyMistake(m)).length,
    sets: sets.filter((s) => !s.deleted).length,
  }
}

/**
 * Settings' "Delete my data on this device". Keeps the cached bank and the two
 * keys that describe it, so the site still loads instantly and offline after,
 * and usage's note of which milestones this browser already reported (no id,
 * just [1, 10]), so starting over does not count the same person twice.
 */
export async function deleteLocalData(): Promise<void> {
  await store.clearUserData([INDEX_AGE_KEY, LIVE_KEY, usage.SENT_KEY])
  await reloadProgress()
}

/** Settings' "Download my data": every user store and the student's own meta keys. */
export const exportLocalData = () => backup.makeBackup()

/** Settings' "Restore from file": merged in, then the in-memory maps rebuilt. */
export async function restoreLocalData(file: backup.Backup): Promise<backup.Restored> {
  const restored = await backup.restoreBackup(file)
  await reloadProgress()
  return restored
}

/** Force a re-read of the index from College Board, picking up new questions. */
export async function refreshIndex(): Promise<number> {
  const stubs = await cb.fetchIndex()
  await store.saveIndex(stubs)
  await store.setMeta(INDEX_AGE_KEY, Date.now())
  // Re-read the practice-test ids at the same time. A test being released is
  // what changes both, so refreshing one without the other would leave the
  // filter describing an older bank than the counts next to it.
  const live = await loadLive(true)
  if (cache) { cache.stubs = stubs; cache.live = live }
  return stubs.length
}

/**
 * Question bodies being fetched right now, so a question opened while its
 * prefetch is still on the wire waits for that request instead of sending a
 * second one.
 */
const inflight = new Map<string, Promise<StoredQuestion>>()

function loadFull(id: string): Promise<StoredQuestion> {
  let pending = inflight.get(id)
  if (!pending) {
    pending = fetchFull(id).finally(() => inflight.delete(id))
    inflight.set(id, pending)
  }
  return pending
}

async function fetchFull(id: string): Promise<StoredQuestion> {
  const cached = await store.loadQuestion(id)
  if (cached) return cached
  const { stubs } = await boot()
  const stub = stubs.find((s) => s._id === id)
  if (!stub) throw new Error(`unknown question ${id}`)
  const raw = await cb.fetchDetail(stub)
  const question = normaliseQuestion(stub, raw)
  await store.saveQuestion(question)
  return question
}

/**
 * Warm the cache with the questions practice is likely to open next. The
 * caller names them, because only it knows the order the list is in. A
 * failure here must never surface to the user.
 */
export function prefetch(ids: string[]): void {
  for (const id of ids) loadFull(id).catch(() => {})
}

/**
 * Drop the answer key before the question reaches React.
 *
 * This mirrors the shape the HTTP backend sends and keeps the key out of
 * component state and the React devtools tree. It is not a security boundary:
 * the record is still in IndexedDB. On a static site it cannot be.
 */
function strip(q: StoredQuestion): Question {
  const { correct, explanations, rationale_html, flags, ...rest } = q
  void correct; void explanations; void rationale_html; void flags
  return rest
}

function lastAttempt(c: Cache, id: string): store.Attempt | null {
  const list = c.attempts.get(id)
  return list?.at(-1) ?? null
}

/** OR within a filter, AND between filters. An empty list is not a filter. */
export const anyOf = <T,>(list: T[] | undefined, value: T | undefined): boolean =>
  !list?.length || (value !== undefined && list.includes(value))

/**
 * On an official full-length practice test.
 *
 * Twin of `is_live` in bluebank/pipeline.py and it has to agree with it, the
 * same way the shuffle key does: the localhost build stores the answer as a
 * column at normalize time and this one decides it per question at filter time,
 * so a disagreement would mean the two backends offered different sets.
 *
 * Matched on external_id and only against its own section's list, which is what
 * College Board's bank does. An `ibn` item has no external_id and so is never
 * live; checking `_path` rather than trusting the lists to be disjoint from the
 * ibn ids keeps that true even if a future list overlaps by accident.
 */
export function isLive(stub: Stub, live: Record<Section, Set<string>>): boolean {
  return stub._path === 'external_id' && (live[stub._section]?.has(stub._id) ?? false)
}

function matches(stub: Stub, c: Cache, f: Filters): boolean {
  if (f.section && stub._section !== f.section) return false
  if (!anyOf(f.domains, stub.primary_class_cd)) return false
  if (!anyOf(f.skills, stub.skill_cd)) return false
  if (!anyOf(f.difficulties, stub.difficulty)) return false
  if (f.excludeLive && isLive(stub, c.live)) return false

  if (f.statuses?.length) {
    const last = lastAttempt(c, stub._id)
    const hit = f.statuses.some((s) => (
      s === 'unseen' ? !last
        : s === 'wrong' ? last?.correct === 0
          : s === 'correct' ? last?.correct === 1
            : c.flagged.has(stub._id)))
    if (!hit) return false
  }
  return true
}

function toSetItem(stub: Stub, c: Cache): SetItem {
  const list = c.attempts.get(stub._id) ?? []
  const last = list.length ? list[list.length - 1] : null
  return {
    id: stub._id,
    cb_id: stub.questionId ?? null,
    section: stub._section,
    domain: stub.primary_class_cd ?? '',
    domain_name: stub.primary_class_cd_desc ?? '',
    skill: stub.skill_cd ?? '',
    skill_name: stub.skill_desc ?? '',
    difficulty: stub.difficulty ?? ('' as SetItem['difficulty']),
    band: stub.score_band_range_cd ?? null,
    // The index does not say whether an item is MCQ or SPR; only the body does.
    // The navigator does not use this, and QuestionView reads the real type off
    // the loaded question, so reporting mcq here is safe.
    type: 'mcq',
    last_correct: last ? last.correct : null,
    last_seconds: last ? last.seconds : null,
    last_response: last ? last.response : null,
    answered_at: last ? last.answered_at : null,
    flagged: c.flagged.has(stub._id) ? 1 : 0,
    attempt_count: list.length,
  }
}

export async function taxonomy(): Promise<{ taxonomy: TaxonomyRow[]; stats: Stats }> {
  const c = await boot()
  const rows = new Map<string, TaxonomyRow>()
  for (const stub of c.stubs) {
    const key = [stub._section, stub.primary_class_cd, stub.skill_cd, stub.difficulty].join('|')
    let row = rows.get(key)
    if (!row) {
      row = {
        section: stub._section,
        domain: stub.primary_class_cd ?? '',
        domain_name: stub.primary_class_cd_desc ?? '',
        skill: stub.skill_cd ?? '',
        skill_name: stub.skill_desc ?? '',
        difficulty: stub.difficulty ?? ('' as TaxonomyRow['difficulty']),
        n: 0, live_n: 0, seen: 0, correct: 0,
      }
      rows.set(key, row)
    }
    row.n++
    if (isLive(stub, c.live)) row.live_n++
    const last = lastAttempt(c, stub._id)
    if (last) {
      row.seen++
      row.correct += last.correct
    }
  }
  return { taxonomy: [...rows.values()], stats: await stats() }
}

export async function questionSet(filters: Filters):
    Promise<{ count: number; questions: SetItem[] }> {
  const c = await boot()
  // The whole pool, never a slice. A practice set draws its questions at
  // random from this and freezes them, so there is nothing to limit here.
  const questions = c.stubs
    .filter((stub) => matches(stub, c, filters))
    .map((stub) => toSetItem(stub, c))
    .sort(byShuffleKey)
  return { count: questions.length, questions }
}

/** What the ID search lists; the rest is a count ("and 12 more"). */
export const MAX_ID_HITS = 5

/**
 * The ID search: rows whose College Board ID starts with `prefix` (lower
 * case), exact match first, then by ID, at most MAX_ID_HITS of them, with the
 * total. Each keystroke builds five rows instead of the whole bank (PF-17).
 */
export function rankByCbId<T>(rows: T[], cbId: (row: T) => string | null | undefined, prefix: string):
    { hits: T[]; total: number } {
  const keyed = rows
    .map((row) => ({ row, id: (cbId(row) ?? '').toLowerCase() }))
    .filter((k) => k.id.startsWith(prefix))
  keyed.sort((a, b) => Number(b.id === prefix) - Number(a.id === prefix) || a.id.localeCompare(b.id))
  return { hits: keyed.slice(0, MAX_ID_HITS).map((k) => k.row), total: keyed.length }
}

export async function findByCbId(prefix: string): Promise<{ hits: SetItem[]; total: number }> {
  const c = await boot()
  const { hits, total } = rankByCbId(c.stubs, (s) => s.questionId, prefix)
  return { hits: hits.map((stub) => toSetItem(stub, c)), total }
}

export async function question(id: string): Promise<{
  question: Question; annotations: Annotation[]; flagged: boolean
  mistake: Mistake | null
}> {
  const c = await boot()
  const [full, saved, logged] = await Promise.all([
    loadFull(id), store.loadAnnotations(id), store.loadMistake(id),
  ])
  return {
    question: strip(full),
    annotations: saved?.items ?? [],
    flagged: c.flagged.has(id),
    mistake: toMistake(logged),
  }
}

/** The stored row as the app sees it: an empty log is no log. */
function toMistake(row: store.MistakeRecord | undefined): Mistake | null {
  if (!row || store.isEmptyMistake(row)) return null
  return { tags: row.tags, note: row.note, updated_at: row.updated_at }
}

export async function saveMistake(
  id: string, tags: MistakeTag[], note: string | null,
): Promise<{ mistake: Mistake | null }> {
  await store.saveMistake(id, tags, note)
  sync.track('mistake', id)
  return { mistake: toMistake(await store.loadMistake(id)) }
}

/** Every question with at least one attempt, most recently answered first. */
export async function reviewed(): Promise<{ questions: SetItem[] }> {
  const c = await boot()
  const questions = c.stubs
    // Marked ones too, answered or not: Review's Marked filter needs them.
    .filter((stub) => Boolean(lastAttempt(c, stub._id)) || c.flagged.has(stub._id))
    .map((stub) => toSetItem(stub, c))
    .sort((a, b) => (b.answered_at ?? 0) - (a.answered_at ?? 0))
  return { questions }
}

/** Every question with a mistake log and its tags, for Review's filters. */
export async function loggedIds(): Promise<{ question_ids: string[]; tags: Record<string, MistakeTag[]> }> {
  const rows = (await store.loadAllMistakes()).filter((m) => !store.isEmptyMistake(m))
  return {
    question_ids: rows.map((m) => m.question_id),
    tags: Object.fromEntries(rows.map((m) => [m.question_id, m.tags])),
  }
}

/** Every attempt at one question, oldest first. */
export async function attemptsFor(id: string): Promise<{ attempts: store.Attempt[] }> {
  const c = await boot()
  return { attempts: [...(c.attempts.get(id) ?? [])] }
}

/** Re-grade a stored response for its explanation. Records nothing. */
export async function explain(id: string, response: string | null): Promise<GradeResult> {
  return grade(await loadFull(id), response)
}

/** requestPersistence() has run this session; see answer(). */
let persistAsked = false

export async function answer(
  id: string, response: string | null, seconds: number,
): Promise<GradeResult> {
  const c = await boot()
  const full = await loadFull(id)
  const result = grade(full, response)

  const attempt: store.Attempt = {
    id: crypto.randomUUID(),
    question_id: id,
    answered_at: nowSec(),
    response,
    correct: result.correct ? 1 : 0,
    seconds,
  }
  await store.saveAttempt(attempt)
  sync.track('attempt', attempt.id)
  // Ask not to be evicted once there is progress worth keeping, not on page
  // load: Firefox shows a prompt for it (PF-15). Once a session at most;
  // Settings has a button too.
  if (!persistAsked) {
    persistAsked = true
    void store.requestPersistence()
  }
  const list = c.attempts.get(id)
  if (list) list.push(attempt)
  else c.attempts.set(id, [attempt])
  // Keyed by question, so this is different questions answered, not answers.
  void usage.answered(c.attempts.size)

  return result
}

export async function flag(id: string, flagged: boolean): Promise<{ flagged: boolean }> {
  const c = await boot()
  await store.saveMark(id, flagged)
  sync.track('mark', id)
  if (flagged) c.flagged.add(id)
  else c.flagged.delete(id)
  return { flagged }
}

export async function saveAnnotations(id: string, annotations: Annotation[]):
    Promise<{ annotations: Annotation[] }> {
  // The editor numbers new highlights (nextAnnotationId). A missing or repeated
  // id, which the highlight menu would confuse with another highlight, is
  // renumbered past the highest in use: never by position, since after a
  // removal position i + 1 can be an id still taken. Integers only, because the
  // sync Worker keeps nothing else.
  const valid = (id: unknown): id is number => Number.isInteger(id) && (id as number) > 0
  let last = Math.max(0, ...annotations.map((a) => (valid(a.id) ? a.id : 0)))
  const taken = new Set<number>()
  const items = annotations.map((a) => {
    const id = valid(a.id) && !taken.has(a.id) ? a.id : ++last
    taken.add(id)
    return { ...a, id }
  })
  await store.saveAnnotations(id, items)
  sync.track('annotation', id)
  return { annotations: items }
}

/** Every attempt, oldest first, with what streaks and the score need. */
export async function history(): Promise<{ history: HistoryRow[] }> {
  const c = await boot()
  const out: HistoryRow[] = []
  for (const stub of c.stubs) {
    for (const a of c.attempts.get(stub._id) ?? []) {
      out.push({
        answered_at: a.answered_at,
        correct: a.correct ? 1 : 0,
        question_id: stub._id,
        section: stub._section,
        band: stub.score_band_range_cd ?? null,
        difficulty: stub.difficulty ?? null,
      })
    }
  }
  return { history: out.sort((a, b) => a.answered_at - b.answered_at) }
}

export async function stats(): Promise<Stats> {
  const c = await boot()
  let attempts = 0
  let correct = 0
  const byDomain = new Map<string, { domain: string; domain_name: string; n: number; c: number }>()

  for (const stub of c.stubs) {
    const last = lastAttempt(c, stub._id)
    if (!last) continue
    attempts++
    correct += last.correct
    const key = stub.primary_class_cd ?? ''
    const row = byDomain.get(key)
      ?? { domain: key, domain_name: stub.primary_class_cd_desc ?? '', n: 0, c: 0 }
    row.n++
    row.c += last.correct
    byDomain.set(key, row)
  }

  return {
    attempts,
    correct,
    accuracy: attempts ? correct / attempts : null,
    by_domain: [...byDomain.values()].sort((a, b) => b.n - a.n),
  }
}

// ------------------------------------------------------------- practice sets

/**
 * Active ones oldest first, because they are a queue of work waiting on the
 * home page. Finished ones newest first, because that is history. Same order
 * the Python backend returns them in.
 */
export async function listSets(active?: boolean, limit = 50): Promise<PracticeSet[]> {
  let rows = (await store.loadSets()).filter((r) => !r.deleted)
  if (active === true) rows = rows.filter((r) => r.finished_at === null)
  if (active === false) rows = rows.filter((r) => r.finished_at !== null)
  rows.sort((a, b) => (active === true
    ? a.created_at - b.created_at
    : (b.finished_at ?? b.created_at) - (a.finished_at ?? a.created_at))
    || a.id.localeCompare(b.id))
  return rows.slice(0, limit).map((row) => summarise(row, false))
}

export async function getSet(id: string): Promise<PracticeSet> {
  const row = await store.loadSet(id)
  if (!row || row.deleted) throw new Error(`unknown set ${id}`)
  return summarise(row, true)
}

export async function saveSet(set: SetInput): Promise<PracticeSet> {
  await store.saveSet(set)
  sync.track('set', set.id)
  return getSet(set.id)
}

/**
 * Delete a set everywhere. Written as a tombstone and synced like any other
 * change; removing the row outright left the server's copy alive, so the set
 * stayed on every other device and came back after the next sign-in.
 */
export async function deleteSet(id: string): Promise<void> {
  const row = await store.loadSet(id)
  if (!row || row.deleted) return
  await store.saveSet({
    id, created_at: row.created_at, finished_at: row.finished_at,
    seconds: 0, filters: {}, items: [], deleted: true,
  })
  sync.track('set', id)
}

function summarise(row: store.SetRecord, withItems: boolean): PracticeSet {
  const items = row.items ?? []
  const out: PracticeSet = {
    id: row.id,
    created_at: row.created_at,
    finished_at: row.finished_at,
    updated_at: row.updated_at,
    seconds: row.seconds,
    filters: row.filters ?? {},
    total: items.length,
    answered: items.filter((i) => i.response !== null && i.response !== '').length,
    correct: items.filter((i) => i.correct).length,
  }
  if (withItems) out.items = items
  return out
}

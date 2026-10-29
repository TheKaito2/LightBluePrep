/**
 * Cloud sync: push what changed locally, pull what changed elsewhere, one
 * round trip.
 *
 * This is a layer ABOVE store.ts, never inside it. Nothing in the app reads or
 * writes through here, so with sync switched off (or the Worker deleted) the
 * app behaves exactly as it did before. That is the anonymous-first guarantee,
 * and it is structural rather than a promise.
 *
 * The merge is easy for one reason: attempts are a set keyed by id, and the
 * only one that ever changes is a practice set's attempt at a question (a
 * fixed id, lib/sets setAttemptId), which the server stores as sent and hands
 * on under a new seq. A sync that fails, half-lands, duplicates, or arrives
 * out of order cannot lose or corrupt anything, so there is no reconciliation
 * logic here and none is needed. Marks and annotations are last-write-wins per
 * question, decided server-side.
 */
import * as auth from './auth'
import * as store from './store'
import { MESSAGES, toUserMessage } from './errors'
import type { Annotation, MistakeTag } from '../types'

export type SyncStatus = 'off' | 'syncing' | 'synced' | 'pending'

const CURSOR_KEY = 'sync.cursor'
const DEBOUNCE_MS = 2000

/**
 * Most pending changes sent in one request. The Worker reads at most 2,000
 * rows per table and dropped the rest, while this side cleared everything it
 * had sent: a first sign-in with more history than that lost the excess from
 * sync for good. Smaller batches also keep each request well under the
 * Worker's body limit. Whatever is left goes on the next round (run() reschedules
 * while the outbox is non-empty).
 */
const BATCH = 500

/**
 * Backoff after a failed sync.
 *
 * Without this, a failure left the badge amber until the user happened to write
 * something, switch tabs, or reload: run() only rescheduled on the success
 * path. Nothing was ever lost, because the outbox is not cleared on failure,
 * but a transient error looked permanent. That matters more now that the Worker
 * can answer 429 (rate limit) or 413 (account at a storage ceiling).
 *
 * Doubling from 5s to a 5min ceiling. A local write still calls schedule() with
 * the normal debounce and takes over the timer, so anything the user does
 * retries immediately rather than waiting out the backoff.
 */
const RETRY_MIN_MS = 5000
const RETRY_MAX_MS = 5 * 60 * 1000
let retryDelay = 0

/** Shown when the server ended the session, so the badge does not just go quiet. */
export const SESSION_ENDED = 'Your sync session ended. Sign in again to keep syncing.'
/** Shown while the account is at its ceiling for practice sets (worker CAPS.sets). */
/** Shown when the server would not store the goal and plan (too large or malformed). */
export const STUDY_REFUSED = 'Your study plan is too large to sync, so it stays on this device.'
export const SETS_REFUSED = "You've reached the 20,000 practice set limit for syncing, so new sets stay on this device."

/** The Worker's table names, as the outbox kinds that feed them. */
const KIND_OF_TABLE: Record<string, store.OutboxKind> = {
  attempts: 'attempt', marks: 'mark', annotations: 'annotation', mistakes: 'mistake', sets: 'set',
  study: 'study',
}

let status: SyncStatus = 'off'
let lastError: string | null = null
let inFlight: Promise<void> | null = null
let timer: ReturnType<typeof setTimeout> | null = null
/** Set by quiesce(): no sync may start until reset() or resume(). */
let stopped = false
const listeners = new Set<() => void>()

export const getStatus = (): SyncStatus => status
export const getError = (): string | null => lastError

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function emit(next: SyncStatus, error: string | null = null) {
  status = next
  lastError = error
  for (const listener of listeners) listener()
}

/** Called on every local write. Cheap, and a no-op when signed out. */
export function track(kind: store.OutboxKind, id: string): void {
  if (!auth.configured || !auth.signedIn()) return
  void store.enqueue(kind, id).then(() => schedule())
}

/**
 * Coalesces a burst of answers into one request. The debounce is not about
 * quota (a heavy day is ~100 requests against a five-figure daily allowance),
 * it is so that answering fast does not fire a request every three seconds, and
 * so the network is never on the answer-submission path.
 */
export function schedule(delayMs: number = DEBOUNCE_MS): void {
  if (stopped || !auth.configured || !auth.signedIn()) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { timer = null; void syncNow() }, delayMs)
}

export function syncNow(): Promise<void> {
  if (stopped) return Promise.resolve()
  if (!auth.configured || !auth.signedIn()) { emit('off'); return Promise.resolve() }
  if (inFlight) return inFlight
  inFlight = run().finally(() => { inFlight = null })
  return inFlight
}

async function run(): Promise<void> {
  emit('syncing')
  try {
    // Snapshot the outbox first. Only these entries are cleared at the end, and
    // only if unchanged, so a write that lands mid-request survives to the next
    // sync even when it re-queues the same key.
    const sent = (await store.loadOutbox()).slice(0, BATCH)
    const payload = await collect(sent.map((e) => e.key))
    const since = (await store.getMeta<number>(CURSOR_KEY)) ?? 0

    const res = await auth.request('/sync', {
      method: 'POST',
      body: JSON.stringify({ since, ...payload }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string }
      throw new Error(body.error || `Sync failed (${res.status})`)
    }
    const data = await res.json() as ServerResponse

    await apply(data)
    await store.setMeta(CURSOR_KEY, data.cursor)
    // A table the account is at its ceiling for was not stored, so its entries
    // stay queued rather than being cleared as if they had arrived.
    const refused = new Set((data.refused ?? []).flatMap((t) => KIND_OF_TABLE[t] ?? []))
    const held = (e: store.OutboxEntry) => {
      const kind = store.parseOutboxKey(e.key)?.kind
      return kind !== undefined && refused.has(kind)
    }
    await store.clearOutbox(sent.filter((e) => !held(e)))

    const remaining = await store.loadOutbox()
    // A backlog (first sign-in) drains in quick rounds rather than one per
    // debounce, and so does a pull the server split into pages; both stay far
    // under the Worker's per-account rate limit.
    if (data.more || remaining.some((e) => !held(e))) {
      retryDelay = 0
      emit('pending', refusedMessage(refused))
      schedule(500)
    } else if (refused.size) {
      // Only refused changes are left. Retried on the failure backoff, not in
      // quick rounds: the answer will be the same until the account has room.
      retryDelay = retryDelay ? Math.min(retryDelay * 2, RETRY_MAX_MS) : RETRY_MIN_MS
      emit('pending', refusedMessage(refused))
      schedule(retryDelay)
    } else {
      retryDelay = 0
      emit(remaining.length ? 'pending' : 'synced')
    }
  } catch (e) {
    if (!auth.signedIn()) {
      // A 401: the session expired or was ended elsewhere, and auth.request has
      // dropped the token. Retrying cannot help, and an amber badge with no
      // reason looked like a fault, so say what happened and stop.
      console.error(e)
      emit('off', SESSION_ENDED)
      return
    }
    // Nothing is cleared on failure, so the outbox still holds everything.
    // Surfaced as amber in the UI rather than swallowed: a sync that silently
    // stops looks identical to one that is switched off.
    retryDelay = retryDelay ? Math.min(retryDelay * 2, RETRY_MAX_MS) : RETRY_MIN_MS
    emit('pending', toUserMessage(e, 'server'))
    schedule(retryDelay)
  }
}

function refusedMessage(refused: Set<store.OutboxKind>): string | null {
  if (!refused.size) return null
  if (refused.size === 1 && refused.has('set')) return SETS_REFUSED
  if (refused.size === 1 && refused.has('study')) return STUDY_REFUSED
  return MESSAGES.storage
}

interface ServerResponse {
  cursor: number
  /** The pull was cut at a page boundary: ask again for the rest. */
  more?: boolean
  /** Tables at their storage ceiling, whose new rows were not stored. */
  refused?: string[]
  attempts: store.Attempt[]
  marks: { question_id: string; flagged: number; updated_at: number }[]
  annotations: { question_id: string; items: Annotation[]; updated_at: number }[]
  mistakes: { question_id: string; tags: MistakeTag[]; note: string | null; updated_at: number }[]
  sets?: store.SetRecord[]
  /** The goal and plan row, when it changed since `since`. */
  study?: store.StudyRecord | null
}

async function collect(keys: string[]) {
  const attemptIds = new Set<string>()
  const markIds = new Set<string>()
  const annotationIds = new Set<string>()
  const mistakeIds = new Set<string>()
  const setIds = new Set<string>()
  let study = false
  for (const key of keys) {
    const parsed = store.parseOutboxKey(key)
    if (!parsed) continue
    if (parsed.kind === 'attempt') attemptIds.add(parsed.id)
    else if (parsed.kind === 'mark') markIds.add(parsed.id)
    else if (parsed.kind === 'annotation') annotationIds.add(parsed.id)
    else if (parsed.kind === 'set') setIds.add(parsed.id)
    else if (parsed.kind === 'study') study = true
    else mistakeIds.add(parsed.id)
  }

  const [allAttempts, allMarks, allAnnotations, allMistakes, allSets, studyRow] =
    await Promise.all([
      attemptIds.size ? store.loadAttempts() : Promise.resolve([]),
      markIds.size ? store.loadMarks() : Promise.resolve([]),
      annotationIds.size ? store.loadAllAnnotations() : Promise.resolve([]),
      mistakeIds.size ? store.loadAllMistakes() : Promise.resolve([]),
      setIds.size ? store.loadSets() : Promise.resolve([]),
      study ? store.loadStudy() : Promise.resolve(undefined),
    ])

  return {
    attempts: allAttempts.filter((a) => attemptIds.has(a.id)),
    marks: allMarks.filter((m) => markIds.has(m.question_id)),
    annotations: allAnnotations.filter((a) => annotationIds.has(a.question_id)),
    mistakes: allMistakes.filter((m) => mistakeIds.has(m.question_id)),
    sets: allSets.filter((s) => setIds.has(s.id)),
    ...(studyRow ? { study: studyRow } : {}),
  }
}

async function apply(data: ServerResponse): Promise<void> {
  const wrote = Boolean(data.attempts?.length || data.marks?.length
    || data.annotations?.length || data.mistakes?.length || data.sets?.length || data.study)
  // Attempts: union, a changed one overwriting by id. Re-putting one we already
  // have is a no-op, which is why the server can safely echo our own writes back.
  if (data.attempts?.length) {
    await store.putMany(store.STORE_ATTEMPTS, data.attempts)
  }
  // Marks and annotations arrive already resolved: the server applied the
  // last-write-wins guard, so whatever came back IS the answer and is written
  // verbatim, timestamp included.
  for (const m of data.marks ?? []) await store.putMark(m)
  for (const a of data.annotations ?? []) {
    await store.putAnnotations({ question_id: a.question_id, items: a.items, updated_at: a.updated_at })
  }
  for (const m of data.mistakes ?? []) {
    await store.putMistake({
      question_id: m.question_id, tags: m.tags, note: m.note, updated_at: m.updated_at,
    })
  }
  // Sets are last-write-wins like marks, guarded locally so a pull that lands
  // mid-set cannot undo this tab's newer write. A tombstone arrives the same way.
  for (const s of data.sets ?? []) await store.putSet(s)
  // The goal and plan: one row, last write wins, the same guard as a set.
  if (data.study) await store.putStudy(data.study)

  if (wrote) {
    dataVersion++
    // Writing the stores is not enough: apiLocal keeps its own maps and would
    // otherwise keep serving the pre-sync numbers until the page reloads.
    if (onApplied) await onApplied()
  }
}

/**
 * First sync after signing in: queue everything already on this device.
 *
 * This is what keeps a month of anonymous practice when someone finally signs
 * in. Safe by construction, because pushing an attempt the server already has
 * is a no-op.
 */
export async function seedOutbox(): Promise<void> {
  const [attempts, marks, annotations, mistakes, sets, study] = await Promise.all([
    store.loadAttempts(), store.loadMarks(), store.loadAllAnnotations(),
    store.loadAllMistakes(), store.loadSets(), store.loadStudy(),
  ])
  await Promise.all([
    ...(study ? [store.enqueue('study', 'me')] : []),
    ...attempts.map((a) => store.enqueue('attempt', a.id)),
    ...marks.map((m) => store.enqueue('mark', m.question_id)),
    ...annotations.map((a) => store.enqueue('annotation', a.question_id)),
    ...mistakes.map((m) => store.enqueue('mistake', m.question_id)),
    ...sets.map((s) => store.enqueue('set', s.id)),
  ])
}

/**
 * Signing out leaves local data alone; only the queue and cursor go.
 *
 * Callers clear the session token first, so nothing new can start; this then
 * waits out a sync already in flight. Otherwise its reply landed after the
 * reset: it rewrote the cursor, turned the badge back to Synced while signed
 * out, and, before a local delete, wrote rows back into the emptied stores.
 * run() never rejects, so the wait cannot throw.
 */
export async function reset(): Promise<void> {
  if (inFlight) await inFlight
  const keys = await store.loadOutbox()
  await store.clearOutbox(keys)
  await store.setMeta(CURSOR_KEY, 0)
  // Otherwise signing back in inherits a backoff earned by the previous session.
  retryDelay = 0
  if (timer) { clearTimeout(timer); timer = null }
  stopped = false
  emit('off')
}

/**
 * Stop syncing and wait until nothing is in flight. Call before deleting the
 * server copy, then reset() once it is gone, or resume() if the delete failed.
 *
 * A sync that had already authenticated could otherwise write its batch after
 * the delete and bring rows back. The Worker guards against that too; this
 * keeps a debounced or visibilitychange sync from even starting meanwhile.
 */
export async function quiesce(): Promise<void> {
  stopped = true
  if (timer) { clearTimeout(timer); timer = null }
  if (inFlight) await inFlight
}

/** Undo quiesce() when the delete it guarded did not happen. */
export function resume(): void {
  stopped = false
  schedule()
}

let dataVersion = 0
/** Bumps only when a sync actually wrote something pulled from the server. */
export const getDataVersion = (): number => dataVersion

let onApplied: (() => Promise<void>) | null = null
/** apiLocal registers here so its in-memory maps can be rebuilt after a pull. */
export function onRemoteData(fn: () => Promise<void>): void { onApplied = fn }

let started = false

/** Wired once from App. Idempotent. */
export function start(): void {
  if (started || !auth.configured) return
  started = true

  // Added even when signed out at boot: signing in later does not call start again.
  document.addEventListener('visibilitychange', () => {
    if (!auth.signedIn()) return
    // Flush on the way out so nothing is stranded when a laptop closes, and
    // pull on the way back in to pick up the other machine.
    void syncNow()
  })

  if (!auth.signedIn()) { emit('off'); return }
  void syncNow()
}

export async function refreshStatus(): Promise<void> {
  if (!auth.signedIn()) { emit('off'); return }
  const remaining = await store.loadOutbox()
  emit(remaining.length ? 'pending' : 'synced')
}

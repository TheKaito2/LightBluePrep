/**
 * Backup and restore (G-05): everything this browser holds about the student,
 * as one JSON file they keep. Signed-out progress lives only in IndexedDB, and
 * Safari wipes that after 7 days without a visit; this is the way out that
 * needs no account.
 *
 * Restore merges rather than replaces, with the same rules sync uses: attempts
 * are a grow-only set keyed by uuid, so the union is always right; marks,
 * highlights, mistakes and sets are last-write-wins on `updated_at`. Restoring
 * an old file over newer work therefore loses nothing, and restoring twice is a
 * no-op. The pure halves (validate, pick what to write) are separate from the
 * IndexedDB halves so they can be tested without a browser.
 */
import * as store from './store'
import * as sync from './sync'

export const BACKUP_FORMAT = 'lightblueprep-backup'
export const BACKUP_VERSION = 1

/**
 * The meta keys that are the student's own choices. Not the sync cursor (it
 * belongs to this device's session), the cached bank's timestamps, or the
 * usage note, which would make a restored browser skip counting a new visitor
 * or count an old one twice.
 */
export const BACKUP_META = [store.GOAL_KEY, store.STUDY_KEY, store.COACH_KEY, store.INSTALL_KEY]

export interface Backup {
  format: typeof BACKUP_FORMAT
  version: number
  exported_at: number
  attempts: store.Attempt[]
  marks: store.MarkRecord[]
  annotations: store.AnnotationRecord[]
  mistakes: store.MistakeRecord[]
  sets: store.SetRecord[]
  meta: Record<string, unknown>
}

/** Thrown with a sentence the student can read. */
export class BackupError extends Error {}

export const backupName = (now: Date = new Date()) =>
  `lightblueprep-backup-${now.toISOString().slice(0, 10)}.json`

// ----------------------------------------------------------- validation
//
// The file comes from outside, maybe edited by hand or from a newer version,
// and its rows go straight into the stores the whole app reads. A row of the
// wrong shape would surface as a crash on some later page, far from its cause,
// so the file is refused whole instead.

type Row = Record<string, unknown>
const isObj = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const strOrNull = (v: unknown) => v === null || typeof v === 'string'
const bit = (v: unknown) => v === 0 || v === 1

const validAttempt = (r: Row) => isStr(r.id) && isStr(r.question_id) && isNum(r.answered_at)
  && strOrNull(r.response) && bit(r.correct) && isNum(r.seconds)
const validMark = (r: Row) => isStr(r.question_id) && bit(r.flagged) && isNum(r.updated_at)
const validAnnotation = (r: Row) => isStr(r.question_id) && isNum(r.updated_at) && Array.isArray(r.items)
  && r.items.every((a) => isObj(a) && isNum(a.id) && typeof a.field === 'string'
    && isNum(a.start_offset) && isNum(a.end_offset) && typeof a.color === 'string' && strOrNull(a.note))
const validMistake = (r: Row) => isStr(r.question_id) && isNum(r.updated_at) && strOrNull(r.note)
  && Array.isArray(r.tags) && r.tags.every((t) => typeof t === 'string')
const validSet = (r: Row) => isStr(r.id) && isNum(r.created_at) && isNum(r.updated_at)
  && (r.finished_at === null || isNum(r.finished_at)) && isNum(r.seconds) && isObj(r.filters)
  && Array.isArray(r.items) && r.items.every((i) => isObj(i) && isStr(i.question_id))
  && (r.deleted === undefined || typeof r.deleted === 'boolean')

function rows<T>(v: unknown, valid: (r: Row) => boolean): T[] {
  if (v === undefined) return []
  if (!Array.isArray(v) || !v.every((r) => isObj(r) && valid(r))) {
    throw new BackupError("This backup file is damaged, so nothing was restored.")
  }
  return v as T[]
}

/** Read a backup file's text, or throw a BackupError saying why it can't be used. */
export function parseBackup(text: string): Backup {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new BackupError("That file isn't a LightBluePrep backup.")
  }
  if (!isObj(data) || data.format !== BACKUP_FORMAT) {
    throw new BackupError("That file isn't a LightBluePrep backup.")
  }
  if (!isNum(data.version) || data.version > BACKUP_VERSION) {
    throw new BackupError('This backup is from a newer version of LightBluePrep. Reload the page and try again.')
  }
  const meta: Record<string, unknown> = {}
  if (isObj(data.meta)) {
    for (const key of BACKUP_META) if (key in data.meta) meta[key] = data.meta[key]
  }
  return {
    format: BACKUP_FORMAT,
    version: data.version,
    exported_at: isNum(data.exported_at) ? data.exported_at : 0,
    attempts: rows(data.attempts, validAttempt),
    marks: rows(data.marks, validMark),
    annotations: rows(data.annotations, validAnnotation),
    mistakes: rows(data.mistakes, validMistake),
    sets: rows(data.sets, validSet),
    meta,
  }
}

// ---------------------------------------------------------------- merge

/** Attempts in the file that this device does not have yet. */
export const newAttempts = (mine: readonly store.Attempt[], theirs: readonly store.Attempt[]) => {
  const have = new Set(mine.map((a) => a.id))
  return theirs.filter((a) => !have.has(a.id))
}

/**
 * Rows in the file that beat this device's copy, last write wins. A tie is the
 * same edit, so it is skipped: that is what makes a second restore a no-op.
 */
export function newerRows<T extends { updated_at: number }>(
  mine: readonly T[], theirs: readonly T[], key: (row: T) => string,
): T[] {
  const stamp = new Map(mine.map((r) => [key(r), r.updated_at]))
  return theirs.filter((r) => {
    const local = stamp.get(key(r))
    return local === undefined || r.updated_at > local
  })
}

/**
 * Meta: a timestamped value (the goal) is last-write-wins like the rows;
 * anything else only fills a gap, since a choice made here is newer than one
 * in a file.
 */
export function metaToWrite(mine: Record<string, unknown>, theirs: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const key of BACKUP_META) {
    if (!(key in theirs) || theirs[key] === null || theirs[key] === undefined) continue
    const local = mine[key]
    const t = (theirs[key] as { updated_at?: unknown }).updated_at
    const l = (local as { updated_at?: unknown } | null | undefined)?.updated_at
    if (local === undefined || local === null || (isNum(t) && isNum(l) && t > l)) out[key] = theirs[key]
  }
  return out
}

// ---------------------------------------------------------- IndexedDB

async function readMeta(): Promise<Record<string, unknown>> {
  const values = await Promise.all(BACKUP_META.map((k) => store.getMeta<unknown>(k)))
  const meta: Record<string, unknown> = {}
  BACKUP_META.forEach((k, i) => { if (values[i] !== undefined) meta[k] = values[i] })
  return meta
}

export async function makeBackup(now: Date = new Date()): Promise<Backup> {
  const [attempts, marks, annotations, mistakes, sets, meta] = await Promise.all([
    store.loadAttempts(), store.loadMarks(), store.loadAllAnnotations(),
    store.loadAllMistakes(), store.loadSets(), readMeta(),
  ])
  return {
    format: BACKUP_FORMAT, version: BACKUP_VERSION, exported_at: now.getTime(),
    attempts, marks, annotations, mistakes, sets, meta,
  }
}

export const backupBlob = (b: Backup) =>
  new Blob([JSON.stringify(b)], { type: 'application/json' })

export interface Restored {
  /** New answers added. */
  answers: number
  /** Marks, highlights, mistake logs and sets that were added or updated. */
  other: number
}

export async function restoreBackup(b: Backup): Promise<Restored> {
  const [attempts, marks, annotations, mistakes, sets, meta] = await Promise.all([
    store.loadAttempts(), store.loadMarks(), store.loadAllAnnotations(),
    store.loadAllMistakes(), store.loadSets(), readMeta(),
  ])
  const add = newAttempts(attempts, b.attempts)
  const byQuestion = (r: { question_id: string }) => r.question_id
  const m = newerRows(marks, b.marks, byQuestion)
  const a = newerRows(annotations, b.annotations, byQuestion)
  const x = newerRows(mistakes, b.mistakes, byQuestion)
  const s = newerRows(sets, b.sets, (r) => r.id)

  if (add.length) await store.putMany(store.STORE_ATTEMPTS, add)
  // putIfNewer underneath: re-checked inside one transaction, so an answer or
  // a sync pull landing during the restore still wins if it is newer.
  for (const r of m) await store.putMark(r)
  for (const r of a) await store.putAnnotations(r)
  for (const r of x) await store.putMistake(r)
  for (const r of s) await store.putSet(r)
  const metaIn = metaToWrite(meta, b.meta)
  for (const [key, value] of Object.entries(metaIn)) await store.setMeta(key, value)

  // Signed in, the restored rows go up like any local change; a no-op otherwise.
  for (const r of add) sync.track('attempt', r.id)
  for (const r of m) sync.track('mark', r.question_id)
  for (const r of a) sync.track('annotation', r.question_id)
  for (const r of x) sync.track('mistake', r.question_id)
  for (const r of s) sync.track('set', r.id)
  if (store.STUDY_KEY in metaIn) sync.track('study', 'me')

  return { answers: add.length, other: m.length + a.length + x.length + s.length }
}

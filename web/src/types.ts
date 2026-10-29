import type { HistoryRow } from './lib/progress'

export type Section = 'RW' | 'MATH'
export type Difficulty = 'E' | 'M' | 'H'
export type QuestionType = 'mcq' | 'spr'

export interface Option {
  label: string
  html: string
}

/** What the API sends before you answer. No key, no rationale. */
export interface Question {
  id: string
  section: Section
  domain: string
  domain_name: string
  skill: string
  skill_name: string
  difficulty: Difficulty
  band: number | null
  type: QuestionType
  stimulus_html: string
  stem_html: string
  options: Option[] | null
  key_recovered: boolean
  /** College Board's explanation names the choices by other letters than shown (a stale reorder). */
  letters_differ?: boolean
  source_path: string
  /** College Board's short id (e.g. 'f8befe75'), the one videos quote. */
  cb_id?: string | null
}

/**
 * Why you got a question wrong, in your own words.
 *
 * `process` is a method slip, `silly` an execution slip, `knowledge` a gap, and
 * `other` the escape hatch. Tags are a list because a question is often two of
 * them at once.
 */
export const MISTAKE_TAGS = ['process', 'silly', 'knowledge', 'other'] as const
export type MistakeTag = (typeof MISTAKE_TAGS)[number]

export interface Mistake {
  tags: MistakeTag[]
  note: string | null
  updated_at: number
}

/** One row of the working set, enough to draw the navigator. */
export interface SetItem {
  id: string
  cb_id?: string | null
  section: Section
  domain: string
  domain_name: string
  skill: string
  skill_name: string
  difficulty: Difficulty
  band: number | null
  type: QuestionType
  last_correct: number | null
  last_seconds: number | null
  last_response: string | null
  answered_at: number | null
  flagged: number
  /** Total attempts ever, so the navigator can tell first-try from retry. */
  attempt_count: number
}

/**
 * The full normalised record, key included, as it is stored locally.
 *
 * The HTTP backend deliberately never sends this to the browser before you
 * answer -- `Question` is the withheld shape. On Cloudflare Pages there is no
 * server to withhold anything, so the key necessarily lives client-side and is
 * only hidden by the UI. That is a real capability difference between the two
 * backends, not an oversight.
 */
export interface StoredQuestion extends Question {
  correct: string[]
  explanations: Record<string, string> | null
  rationale_html: string | null
  flags: string[]
}

/** One highlight. `id` is a small integer, unique within its question's list. */
export interface Annotation {
  id: number
  field: string
  start_offset: number
  end_offset: number
  color: string
  note: string | null
}

export interface GradeResult {
  question_id: string
  response: string | null
  correct: boolean
  match: 'listed' | 'equivalent' | null
  accepted: string[]
  why_wrong_html: string | null
  why_right_html: string | null
  rationale_html: string | null
}

export interface TaxonomyRow {
  section: Section
  domain: string
  domain_name: string
  skill: string
  skill_name: string
  difficulty: Difficulty
  n: number
  /** How many of `n` are on an official practice test. */
  live_n: number
  seen: number
  correct: number
}

export interface Stats {
  attempts: number
  correct: number
  accuracy: number | null
  by_domain: { domain: string; domain_name: string; n: number; c: number }[]
}

/** One recorded answer. The store owns the browser copy; this is the shape. */
export interface Attempt {
  id: string
  question_id: string
  answered_at: number
  response: string | null
  correct: 0 | 1
  seconds: number
}

export type Status = 'unseen' | 'wrong' | 'correct' | 'flagged'

/**
 * Everything except `section` is a list, and an empty list means "no filter"
 * rather than "nothing matches". Within a row the values are OR'd (medium OR
 * hard); across rows they are AND'd (reading AND (medium OR hard)).
 *
 * `section` stays single because it is the mode you pick on the way in, and
 * "Everything" already covers both.
 *
 * Undefined rather than [] when empty, so the "All" chip has one thing to test.
 */
export interface Filters {
  section?: Section
  domains?: string[]
  skills?: string[]
  difficulties?: Difficulty[]
  statuses?: Status[]
  /**
   * Process types ("skill.key", see lib/similar.ts). Narrows only the skills
   * it names: a skill with no type picked stays whole.
   */
  types?: string[]
  /** Drop questions that also appear on an official full-length practice test. */
  excludeLive?: boolean
  /**
   * How many questions the set should hold. Undefined is the default and means
   * the whole filtered pool, which is endless practice with no end screen.
   * A number turns it into a practice set: a fixed run that you finish, score
   * and can look back at.
   */
  size?: number
  /**
   * Pace multiplier for the set clock: 0.75, 1, 1.25 or 1.5 times the time the
   * real test would give for these questions. 0 or undefined is untimed.
   *
   * Not a filter of questions, and both backends ignore it. It rides here
   * because it is part of what you asked for when you built the set, so it
   * lands in the set's stored `filters` and the history can say how it was run.
   */
  speed?: number
  /**
   * A plan's set: each answer is marked as it is given, like open practice,
   * and Submit is there. Nothing is recorded until the set ends (the attempts
   * are written then), so checking a question is never a second attempt.
   */
  instant?: boolean
  /**
   * Display names of `skills`, in the same order, written once when a set is
   * created so its name survives a skill this build has no label for. Not a
   * filter either; it rides in `filters` because every store (IndexedDB, the
   * local server, the sync Worker) already keeps that as opaque JSON.
   */
  skill_names?: string[]
  /**
   * A name that replaces the topic in the set's label ("Score check"). Not a
   * filter; it rides along in `filters` like `skill_names`.
   */
  title?: string
}

/** One question's outcome inside a finished set. */
export interface SetAnswer {
  question_id: string
  response: string | null
  correct: 0 | 1
  seconds: number
}

/**
 * A practice set: a frozen, randomly drawn list of questions and the progress
 * against it. Active until `finished_at` is set.
 *
 * `items` is a snapshot, not a live read of the attempts table: answering one
 * of these questions again next week must not change what this set scored.
 */
export interface PracticeSet {
  id: string
  created_at: number
  /** Null while the set is still active. */
  finished_at: number | null
  updated_at: number
  seconds: number
  filters: Filters
  total: number
  answered: number
  correct: number
  /** Absent in the list view, present when one set is fetched on its own. */
  items?: SetAnswer[]
}

/** What a set save sends; the backend adds `updated_at` and the tallies. */
export interface SetInput {
  id: string
  created_at: number
  finished_at: number | null
  seconds: number
  filters: Filters
  items: SetAnswer[]
}

/**
 * What both data backends (apiHttp for localhost, apiLocal for the static
 * build) provide. api.ts checks each against it, so the two cannot drift apart.
 */
export interface Backend {
  taxonomy(): Promise<{ taxonomy: TaxonomyRow[]; stats: Stats }>
  questionSet(filters: Filters): Promise<{ count: number; questions: SetItem[] }>
  question(id: string): Promise<{
    question: Question; annotations: Annotation[]; flagged: boolean; mistake: Mistake | null
  }>
  /** Warm the cache for questions likely to be opened next. Never throws. */
  prefetch(ids: string[]): void
  answer(id: string, response: string | null, seconds: number): Promise<GradeResult>
  flag(id: string, flagged: boolean): Promise<{ flagged: boolean }>
  saveAnnotations(id: string, annotations: Annotation[]): Promise<{ annotations: Annotation[] }>
  explain(id: string, response: string | null): Promise<GradeResult>
  attemptsFor(id: string): Promise<{ attempts: Attempt[] }>
  loggedIds(): Promise<{ question_ids: string[]; tags: Record<string, MistakeTag[]> }>
  saveMistake(id: string, tags: MistakeTag[], note: string | null): Promise<{ mistake: Mistake | null }>
  reviewed(): Promise<{ questions: SetItem[] }>
  stats(): Promise<Stats>
  history(): Promise<{ history: HistoryRow[] }>
  listSets(active?: boolean, limit?: number): Promise<PracticeSet[]>
  getSet(id: string): Promise<PracticeSet>
  saveSet(set: SetInput): Promise<PracticeSet>
  deleteSet(id: string): Promise<void>
}

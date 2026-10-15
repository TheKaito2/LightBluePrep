/**
 * Streaks and the estimated score, computed from the attempt history.
 *
 * Pure functions so they can be tested without a browser. Times are unix
 * seconds; days are the viewer's LOCAL calendar days, because a streak is about
 * "did I practise today" where the student lives.
 */
import type { Difficulty, Section } from '../types'

export interface HistoryRow {
  answered_at: number
  correct: 0 | 1
  question_id: string
  section: Section
  band: number | null
  difficulty: Difficulty | null
}

// ------------------------------------------------------------------ streaks

/** YYYY-MM-DD in local time. */
export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

export interface Streak {
  /** Consecutive active days ending today, or yesterday if today is still empty. */
  current: number
  best: number
  /** Answers today. */
  today: number
  /** True when today has no answers yet but the streak is alive from yesterday. */
  atRisk: boolean
  /** Oldest first, the last seven days ending today. */
  last7: boolean[]
}

export function streak(rows: readonly HistoryRow[], now: Date = new Date()): Streak {
  const days = new Set(rows.map((r) => dayKey(new Date(r.answered_at * 1000))))
  const todayKey = dayKey(now)
  const today = rows.filter((r) => dayKey(new Date(r.answered_at * 1000)) === todayKey).length

  const runFrom = (start: Date) => {
    let n = 0
    for (let d = start; days.has(dayKey(d)); d = addDays(d, -1)) n++
    return n
  }
  const atRisk = !days.has(todayKey) && days.has(dayKey(addDays(now, -1)))
  const current = days.has(todayKey) ? runFrom(now) : atRisk ? runFrom(addDays(now, -1)) : 0

  let best = 0
  for (const key of days) {
    const [y = 0, m = 1, d = 1] = key.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    // Only count a run from its first day, so each run is walked once.
    if (days.has(dayKey(addDays(date, -1)))) continue
    let n = 0
    for (let x = date; days.has(dayKey(x)); x = addDays(x, 1)) n++
    best = Math.max(best, n)
  }

  const last7 = Array.from({ length: 7 }, (_, i) => days.has(dayKey(addDays(now, i - 6))))
  return { current, best, today, atRisk, last7 }
}

// ------------------------------------------------------------ score estimate
//
// An Elo-style rating per section on the SAT's 200-800 scale. Each question is
// rated from College Board's own score band (1-7): getting a hard one right
// moves you up a lot, missing an easy one moves you down a lot. Only the first
// attempt at a question counts, so re-drilling one you have seen cannot pump
// the number. It is a practice estimate, not an official score.

export const UNLOCK_AFTER = 10
const START = 500
const SCALE = 200
const FALLBACK_BAND: Record<Difficulty, number> = { E: 2, M: 4, H: 6 }

export function questionRating(band: number | null, difficulty: Difficulty | null): number {
  const b = band ?? (difficulty ? FALLBACK_BAND[difficulty] : 4)
  return 175 + 85 * b
}

const clamp = (x: number) => Math.min(800, Math.max(200, x))
const round10 = (x: number) => Math.round(x / 10) * 10

export interface ScorePoint {
  date: string
  rw: number | null
  math: number | null
  total: number | null
}

export interface Score {
  rw: number | null
  math: number | null
  total: number | null
  /** First attempts counted per section, for the unlock message. */
  counted: Record<Section, number>
  /** One point per active day, oldest first. */
  series: ScorePoint[]
  /** Total now minus total at the last snapshot at least 7 days old. */
  delta7: number | null
}

export function score(rows: readonly HistoryRow[], now: Date = new Date()): Score {
  const rating: Record<Section, number> = { RW: START, MATH: START }
  const counted: Record<Section, number> = { RW: 0, MATH: 0 }
  const seen = new Set<string>()
  const series: ScorePoint[] = []

  const shown = (s: Section) => (counted[s] >= UNLOCK_AFTER ? round10(rating[s]) : null)
  const snapshot = (date: string): ScorePoint => {
    const rw = shown('RW')
    const math = shown('MATH')
    return { date, rw, math, total: rw !== null && math !== null ? rw + math : null }
  }

  const sorted = [...rows].sort((a, b) => a.answered_at - b.answered_at)
  let day: string | null = null
  for (const r of sorted) {
    const key = dayKey(new Date(r.answered_at * 1000))
    if (day !== null && key !== day) series.push(snapshot(day))
    day = key
    if (seen.has(r.question_id)) continue
    seen.add(r.question_id)

    const q = questionRating(r.band, r.difficulty)
    const expected = 1 / (1 + 10 ** ((q - rating[r.section]) / SCALE))
    const k = counted[r.section] < 15 ? 48 : 24
    rating[r.section] = clamp(rating[r.section] + k * (r.correct - expected))
    counted[r.section]++
  }
  if (day !== null) series.push(snapshot(day))

  const final = snapshot(dayKey(now))
  const cutoff = dayKey(addDays(now, -7))
  const before = [...series].reverse().find((p) => p.date <= cutoff && p.total !== null)
  return {
    rw: final.rw,
    math: final.math,
    total: final.total,
    counted,
    series,
    delta7: final.total !== null && before?.total != null ? final.total - before.total : null,
  }
}

// ---------------------------------------------------------- one set's gains

export interface SetGains {
  /** Questions in the set answered for the first time ever. */
  fresh: number
  /** Estimated total just before the set, and with its answers in. */
  before: number | null
  after: number | null
}

/**
 * What one finished set added, measured from its own answers: the history
 * before it started plus the set's attempts between `from` and `to`. Anything
 * else answered while a set sat half done is left out, so the figures belong
 * to the set even when it is reopened weeks later.
 */
export function setGains(
  rows: readonly HistoryRow[], ids: readonly string[], from: number, to: number,
): SetGains {
  const inSet = new Set(ids)
  const prior = rows.filter((r) => r.answered_at < from)
  const mine = rows.filter((r) => inSet.has(r.question_id) && r.answered_at >= from && r.answered_at <= to)
  const seen = new Set(prior.map((r) => r.question_id))
  return {
    fresh: new Set(mine.map((r) => r.question_id).filter((id) => !seen.has(id))).size,
    before: score(prior).total,
    after: score([...prior, ...mine]).total,
  }
}

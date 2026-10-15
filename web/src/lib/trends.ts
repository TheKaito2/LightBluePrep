/**
 * Recent trend and pace, from the attempt history: is the student getting
 * more right, and fast enough for the real clock?
 *
 * Weeks are rolling seven-day windows ending tonight in the viewer's local
 * time, not calendar weeks, so the newest bar is always a full week and a
 * Monday never shows a near-empty "this week".
 */
import { SECONDS_PER_QUESTION } from './pacing'
import type { HistoryRow } from './progress'
import { SECTIONS } from './labels'
import type { Section } from '../types'

export const WEEKS = 4

/** Attempts in the window before the block is worth showing. */
export const MIN_RECENT = 20

/** Slower than this multiple of the real pace is flagged. */
export const PACE_WARN = 1.2

export interface Week {
  /** Local midnight that opens the window. */
  start: Date
  /** Local midnight that closes it (exclusive). */
  end: Date
  seen: number
  correct: number
}

export interface Pace {
  /** Mean seconds per timed answer. */
  mean: number
  target: number
  /** Timed answers behind the mean. */
  n: number
  slow: boolean
}

export interface Trends {
  /** Oldest first. */
  weeks: Week[]
  /** Answers across all the weeks. */
  answered: number
  /** Null for a section with no timed answers in the window. */
  pace: Record<Section, Pace | null>
}

function midnight(d: Date, addDays = 0): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + addDays)
}

export function trends(rows: readonly HistoryRow[], now: Date = new Date()): Trends {
  // Built from calendar days, not 7 * 86400, so a DST change cannot shift a boundary.
  const weeks: Week[] = Array.from({ length: WEEKS }, (_, i) => ({
    start: midnight(now, 1 - (WEEKS - i) * 7),
    end: midnight(now, 1 - (WEEKS - 1 - i) * 7),
    seen: 0,
    correct: 0,
  }))
  const from = weeks[0]!.start.getTime() / 1000
  const to = weeks[WEEKS - 1]!.end.getTime() / 1000
  const time = { RW: { sum: 0, n: 0 }, MATH: { sum: 0, n: 0 } }

  for (const r of rows) {
    if (r.answered_at < from || r.answered_at >= to) continue
    const w = weeks.find((x) => r.answered_at < x.end.getTime() / 1000)!
    w.seen++
    w.correct += r.correct
    // Zero or missing is an answer with no clock (an import, an old row), not a fast one.
    if (r.seconds && r.seconds > 0) {
      time[r.section].sum += r.seconds
      time[r.section].n++
    }
  }

  const pace = {} as Record<Section, Pace | null>
  for (const s of SECTIONS) {
    const { sum, n } = time[s]
    const target = SECONDS_PER_QUESTION[s]
    pace[s] = n ? { mean: sum / n, target, n, slow: sum / n > PACE_WARN * target } : null
  }
  return { weeks, answered: weeks.reduce((a, w) => a + w.seen, 0), pace }
}

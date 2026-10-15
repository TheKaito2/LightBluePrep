import { describe, expect, it } from 'vitest'
import { SECONDS_PER_QUESTION } from './pacing'
import type { HistoryRow } from './progress'
import { PACE_WARN, trends } from './trends'
import type { Section } from '../types'

const NOW = new Date(2026, 9, 15, 18, 0, 0) // 15 Oct 2026, 6pm local

/** Unix seconds for noon local, `daysAgo` days before NOW. */
const at = (daysAgo: number, hour = 12) =>
  Math.floor(new Date(2026, 9, 15 - daysAgo, hour).getTime() / 1000)

function row(t: number, correct: 0 | 1, section: Section = 'RW', seconds: number | null = 60): HistoryRow {
  return { answered_at: t, correct, question_id: `q${t}`, section, band: 4, difficulty: null, seconds }
}

describe('trends: weeks', () => {
  it('buckets into four rolling weeks, oldest first, ending tonight', () => {
    const t = trends([
      row(at(0), 1), row(at(6), 0), // newest week: today back to 6 days ago
      row(at(7), 1), // second newest
      row(at(27), 1), row(at(27), 0), // oldest
    ], NOW)
    expect(t.weeks.map((w) => [w.seen, w.correct])).toEqual([[2, 1], [0, 0], [1, 1], [2, 1]])
    expect(t.weeks[3]!.end).toEqual(new Date(2026, 9, 16))
    expect(t.weeks[0]!.start).toEqual(new Date(2026, 8, 18))
    expect(t.answered).toBe(5)
  })

  it('leaves out attempts older than four weeks or in the future', () => {
    const t = trends([row(at(28), 1), row(at(-1), 1), row(at(0, 23), 1)], NOW)
    expect(t.answered).toBe(1)
  })
})

describe('trends: pace', () => {
  it('averages timed answers per section and ignores untimed ones', () => {
    const t = trends([
      row(at(1), 1, 'RW', 70), row(at(2), 1, 'RW', 90),
      row(at(1), 1, 'RW', 0), row(at(1), 1, 'RW', null),
      row(at(40), 1, 'RW', 500), // outside the window
    ], NOW)
    expect(t.pace.RW).toMatchObject({ mean: 80, n: 2, slow: false })
    expect(t.pace.RW!.target).toBeCloseTo(SECONDS_PER_QUESTION.RW, 5)
    expect(t.pace.MATH).toBeNull()
  })

  it('flags a section only above 1.2 times the real pace', () => {
    const limit = PACE_WARN * SECONDS_PER_QUESTION.MATH
    expect(trends([row(at(1), 1, 'MATH', Math.floor(limit))], NOW).pace.MATH!.slow).toBe(false)
    expect(trends([row(at(1), 1, 'MATH', Math.ceil(limit))], NOW).pace.MATH!.slow).toBe(true)
  })
})

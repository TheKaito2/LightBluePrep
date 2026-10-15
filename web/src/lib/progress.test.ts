import { describe, expect, it } from 'vitest'
import { questionRating, score, setGains, streak, type HistoryRow } from './progress'
import type { Section } from '../types'

/** Local-time timestamp in seconds for `daysAgo` days before `now`, at noon. */
function at(now: Date, daysAgo: number, hour = 12): number {
  const d = new Date(now)
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

function row(t: number, correct: 0 | 1, id: string, section: Section = 'MATH', band = 4): HistoryRow {
  return { answered_at: t, correct, question_id: id, section, band, difficulty: null }
}

const NOW = new Date(2026, 9, 8, 18, 0, 0) // 8 Oct 2026, 6pm local

describe('streak', () => {
  it('counts consecutive days ending today', () => {
    const rows = [row(at(NOW, 0), 1, 'a'), row(at(NOW, 1), 1, 'b'), row(at(NOW, 2), 0, 'c')]
    const s = streak(rows, NOW)
    expect(s.current).toBe(3)
    expect(s.atRisk).toBe(false)
    expect(s.today).toBe(1)
  })

  it('stays alive from yesterday until today ends', () => {
    const s = streak([row(at(NOW, 1), 1, 'a'), row(at(NOW, 2), 1, 'b')], NOW)
    expect(s.current).toBe(2)
    expect(s.atRisk).toBe(true)
    expect(s.today).toBe(0)
  })

  it('breaks after a missed day', () => {
    expect(streak([row(at(NOW, 2), 1, 'a')], NOW).current).toBe(0)
  })

  it('remembers the best run and the last seven days', () => {
    const rows = [5, 6, 7, 8, 0].map((d, i) => row(at(NOW, d), 1, `q${i}`))
    const s = streak(rows, NOW)
    expect(s.best).toBe(4)
    expect(s.current).toBe(1)
    expect(s.last7).toEqual([true, true, false, false, false, false, true])
  })

  it('uses local calendar days, not 24-hour windows', () => {
    // 11pm yesterday and 1am today are two days.
    const s = streak([row(at(NOW, 1, 23), 1, 'a'), row(at(NOW, 0, 1), 1, 'b')], NOW)
    expect(s.current).toBe(2)
  })

  it('is empty with no history', () => {
    const s = streak([], NOW)
    expect(s).toMatchObject({ current: 0, best: 0, today: 0, atRisk: false })
  })
})

describe('score', () => {
  const many = (n: number, correct: 0 | 1, band: number, section: Section = 'MATH', day = 0) =>
    Array.from({ length: n }, (_, i) =>
      row(at(NOW, day) + i, correct, `${section}-${band}-${correct}-${day}-${i}`, section, band))

  it('stays locked until enough questions per section', () => {
    const s = score(many(9, 1, 4), NOW)
    expect(s.math).toBeNull()
    expect(s.counted.MATH).toBe(9)
    expect(s.total).toBeNull()
  })

  it('rises on hard questions answered right and falls on easy ones missed', () => {
    const up = score(many(20, 1, 7), NOW).math!
    const down = score(many(20, 0, 1), NOW).math!
    expect(up).toBeGreaterThan(600)
    expect(down).toBeLessThan(400)
  })

  it('ignores retries of the same question', () => {
    const base = many(12, 1, 4)
    const retried = [...base, ...Array.from({ length: 30 }, (_, i) =>
      row(at(NOW, 0) + 100 + i, 1, base[0]!.question_id))]
    expect(score(retried, NOW).math).toBe(score(base, NOW).math)
  })

  it('stays on the 200-800 scale', () => {
    expect(score(many(200, 1, 7), NOW).math).toBeLessThanOrEqual(800)
    expect(score(many(200, 0, 1), NOW).math).toBeGreaterThanOrEqual(200)
  })

  it('totals both sections and tracks a weekly delta', () => {
    const rows = [
      ...many(12, 0, 4, 'RW', 10), ...many(12, 0, 4, 'MATH', 10),
      ...many(12, 1, 6, 'RW', 0), ...many(12, 1, 6, 'MATH', 0),
    ]
    const s = score(rows, NOW)
    expect(s.total).toBe(s.rw! + s.math!)
    expect(s.series).toHaveLength(2)
    expect(s.delta7).toBeGreaterThan(0)
  })

  it('rates questions by College Board band, falling back to difficulty', () => {
    expect(questionRating(1, null)).toBe(260)
    expect(questionRating(7, null)).toBe(770)
    expect(questionRating(null, 'H')).toBe(questionRating(6, null))
  })
})

describe('setGains', () => {
  const unlocked = (t: number) => [
    ...Array.from({ length: 10 }, (_, i) => row(t, 1, `r${i}`, 'RW')),
    ...Array.from({ length: 10 }, (_, i) => row(t, 1, `m${i}`, 'MATH')),
  ]

  it('counts first tries and moves the estimate by the set alone', () => {
    const from = at(NOW, 0, 9)
    const to = at(NOW, 0, 10)
    const rows = [
      ...unlocked(at(NOW, 3)),
      row(from + 60, 1, 'new1'), row(from + 120, 1, 'new2'),
      row(from + 180, 0, 'm0'), // seen before the set: not fresh, not counted
      row(from + 240, 0, 'other'), // answered during the set, but not in it
      row(to + 600, 1, 'new3'), // after the set ended
    ]
    const g = setGains(rows, ['new1', 'new2', 'm0', 'new3'], from, to)
    expect(g.fresh).toBe(2)
    expect(g.before).not.toBeNull()
    expect(g.after! - g.before!).toBeGreaterThan(0)
  })

  it('has no estimate until both sections unlock', () => {
    const g = setGains([row(at(NOW, 0), 1, 'a')], ['a'], at(NOW, 1), at(NOW, 0, 23))
    expect(g).toEqual({ fresh: 1, before: null, after: null })
  })
})

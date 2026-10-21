import { describe, expect, it } from 'vitest'
import {
  WEIGHT_PRESETS, buildPlan, coverPlan, dayQuotas, markFinished, nextPart, patchPart, togglePart, missed, nextSession, phaseCounts, planProgress, questionsFor, reflow,
  sectionShares, sessionDates, type PlanAnswers,
} from './plan'
import type { SkillTally } from './taxonomy'
import type { Plan } from './plan'

const skill = (code: string, domain: string, section: 'RW' | 'MATH', seen = 0, correct = 0, n = 100): SkillTally =>
  ({ code, name: code, domain, domainName: domain, section, n, seen, correct })

const SKILLS: SkillTally[] = [
  skill('CID', 'INI', 'RW'), skill('COE', 'INI', 'RW', 20, 18), skill('WIC', 'CAS', 'RW', 10, 3),
  skill('TRA', 'EOI', 'RW'), skill('BOU', 'SEC', 'RW'),
  skill('H.A.', 'H', 'MATH', 10, 2), skill('H.B.', 'H', 'MATH'), skill('P.C.', 'P', 'MATH'),
  skill('Q.A.', 'Q', 'MATH'), skill('S.A.', 'S', 'MATH', 50, 50, 50),
]

const answers = (over: Partial<PlanAnswers> = {}): PlanAnswers => ({
  test_date: '2026-12-05', target: 1400, days: [1, 3, 5], minutes: 30,
  start_from: 'estimate', focus: 'auto', ...over,
})

let n = 0
const ctx = (over = {}) => ({ today: '2026-10-20', skills: SKILLS, estimate: null, now: 1, newId: () => `s${n++}`, ...over })

describe('sessionDates', () => {
  it('lists the chosen weekdays and stops two days before the test', () => {
    // Tue 20 Oct 2026; Mon/Wed/Fri up to Thu 3 Dec (test Sat 5 Dec).
    const d = sessionDates('2026-10-20', '2026-12-05', [1, 3, 5])
    expect(d[0]).toBe('2026-10-21')
    expect(d.at(-1)).toBe('2026-12-02')
    expect(d).not.toContain('2026-12-04')
    expect(d.every((x) => [1, 3, 5].includes(new Date(`${x}T00:00:00`).getDay()))).toBe(true)
  })
  it('is empty with no days, a past test, or a test tomorrow', () => {
    expect(sessionDates('2026-10-20', '2026-12-05', [])).toEqual([])
    expect(sessionDates('2026-10-20', '2026-10-01', [0, 1, 2, 3, 4, 5, 6])).toEqual([])
    expect(sessionDates('2026-10-20', '2026-10-21', [0, 1, 2, 3, 4, 5, 6])).toEqual([])
  })
  it('counts calendar days across a daylight-saving change', () => {
    // US clocks change on 1 Nov 2026; every day must appear once.
    const d = sessionDates('2026-10-30', '2026-11-06', [0, 1, 2, 3, 4, 5, 6])
    expect(d).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'])
  })
})

describe('questionsFor', () => {
  it('rounds to 5 inside 5..40', () => {
    expect(questionsFor(30)).toBe(15)
    expect(questionsFor(5)).toBe(5)
    expect(questionsFor(240)).toBe(40)
  })
})

describe('phaseCounts', () => {
  it('splits a long plan and always ends in review', () => {
    expect(phaseCounts(20, true)).toEqual({ baseline: 1, build: 12, mixed: 5, review: 2 })
    expect(phaseCounts(4, true)).toEqual({ baseline: 0, build: 0, mixed: 3, review: 1 })
    expect(phaseCounts(1, false)).toEqual({ baseline: 0, build: 0, mixed: 1, review: 0 })
    expect(phaseCounts(0, false).build).toBe(0)
  })
})

describe('sectionShares', () => {
  it('leans to the section further from half the target, within 30-70%', () => {
    expect(sectionShares(1400, { rw: 680, math: 520 }, 'auto').MATH).toBeCloseTo(0.7)
    expect(sectionShares(1400, { rw: 600, math: 600 }, 'auto').RW).toBe(0.5)
    expect(sectionShares(null, null, 'auto')).toEqual({ RW: 0.5, MATH: 0.5 })
    expect(sectionShares(1400, null, 'MATH')).toEqual({ RW: 0, MATH: 1 })
  })
})

describe('buildPlan', () => {
  it('dates every session in order, phases in order, sized from the minutes', () => {
    const p = buildPlan(answers({ start_from: 'score_check' }), ctx())
    const dates = sessionDates('2026-10-20', '2026-12-05', [1, 3, 5])
    expect(p.sessions.map((s) => s.date)).toEqual(dates)
    expect(p.sessions[0]!.phase).toBe('baseline')
    expect(p.sessions.at(-1)!.phase).toBe('review')
    const order = ['baseline', 'build', 'mixed', 'review']
    const ranks = p.sessions.map((s) => order.indexOf(s.phase))
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    expect(p.sessions.filter((s) => s.phase === 'build').every((s) => s.filters.size === 15)).toBe(true)
  })
  it('skips the baseline once the estimate is unlocked', () => {
    const p = buildPlan(answers({ start_from: 'score_check' }), ctx({ estimate: { rw: 600, math: 600 } }))
    expect(p.sessions.some((s) => s.phase === 'baseline')).toBe(false)
  })
  it('favours weak, unfinished skills and never repeats one back to back', () => {
    const p = buildPlan(answers(), ctx())
    const build = p.sessions.filter((s) => s.phase === 'build').map((s) => s.filters.skills![0])
    expect(build).toContain('H.A.') // 2 of 10
    expect(build).not.toContain('S.A.') // every question done, all right
    for (let i = 1; i < build.length; i++) {
      const others = new Set(build).size > 1
      if (others) expect(build[i]).not.toBe(build[i - 1])
    }
  })
  it('keeps to one section or the chosen domains', () => {
    const math = buildPlan(answers({ focus: 'MATH' }), ctx())
    expect(math.sessions.filter((s) => s.filters.section).every((s) => s.filters.section === 'MATH')).toBe(true)
    const sec = buildPlan(answers({ focus: ['SEC'] }), ctx())
    expect(sec.sessions.filter((s) => s.phase === 'build').every((s) => s.filters.skills![0] === 'BOU')).toBe(true)
  })
  it('is empty when no day fits', () => {
    expect(buildPlan(answers({ days: [] }), ctx()).sessions).toEqual([])
  })
})

describe('reflow and progress', () => {
  const base = () => buildPlan(answers({ days: [0, 1, 2, 3, 4, 5, 6] }), ctx())
  it('moves missed sessions forward, keeps done ones, ends before the test', () => {
    const p = base()
    p.sessions[0]!.done_at = 5
    // Two days later: session 2 (21 Oct) was missed.
    const later = '2026-10-22'
    expect(missed(p, later).map((s) => s.date)).toEqual(['2026-10-21'])
    const r = reflow(p, later)
    expect(missed(r, later)).toEqual([])
    expect(r.sessions.find((s) => s.done_at)!.date).toBe('2026-10-20')
    expect(r.sessions.filter((s) => !s.done_at)[0]!.date).toBe(later)
    expect(r.sessions.every((s) => s.date <= '2026-12-03')).toBe(true)
    // One fewer slot than sessions: a build session goes, the review stays.
    expect(r.sessions.length).toBe(p.sessions.length - 1)
    expect(r.sessions.filter((s) => s.phase === 'review').length).toBe(2)
  })
  it('finds today, then the next one, and closes finished sets', () => {
    const p = base()
    expect(nextSession(p, '2026-10-20')).toMatchObject({ today: true })
    p.sessions[0]!.skipped = true
    expect(nextSession(p, '2026-10-20')).toMatchObject({ today: false, session: { date: '2026-10-21' } })
    p.sessions[1]!.set_id = 'set1'
    const done = markFinished(p, new Map([['set1', 99]]))
    expect(done.sessions[1]!.done_at).toBe(99)
    expect(markFinished(done, new Map([['set1', 99]]))).toBe(done)
    expect(planProgress(done)).toEqual({ done: 1, total: p.sessions.length - 1 })
  })
})

describe('reflow on a hand-built plan', () => {
  it('moves only the missed session and leaves the ones placed ahead alone', () => {
    const plan = {
      test_date: '2026-12-05', target: null, days: [], minutes: 30, start_from: 'estimate' as const,
      focus: 'auto' as const, created_at: 1, source: 'manual' as const,
      sessions: [
        { id: 'a', date: '2026-10-18', phase: 'build' as const, title: 'A', filters: { size: 10 } },
        { id: 'b', date: '2026-11-07', phase: 'build' as const, title: 'B', filters: { size: 10 } },
        { id: 'c', date: '2026-10-20', phase: 'build' as const, title: 'C', filters: { size: 10 } },
      ],
    }
    const r = reflow(plan, '2026-10-20')
    expect(r.sessions.find((s) => s.id === 'a')!.date).toBe('2026-10-21')
    expect(r.sessions.find((s) => s.id === 'b')!.date).toBe('2026-11-07')
    expect(r.sessions.find((s) => s.id === 'c')!.date).toBe('2026-10-20')
  })
})

const TUE_HALF = WEIGHT_PRESETS.find((p) => p.key === 'weekends-tue')!.weights

describe('dayQuotas', () => {
  it('sums exactly, weekends twice a weekday, Tuesday half', () => {
    // Mon 26 Oct .. Sun 1 Nov 2026: weights 1, .5, 1, 1, 1, 2, 2 = 8.5
    const dates = sessionDates('2026-10-26', '2026-11-03', [0, 1, 2, 3, 4, 5, 6])
    const q = dayQuotas(dates, TUE_HALF, 850)
    expect(q.reduce((a, b) => a + b, 0)).toBe(850)
    expect(q).toEqual([100, 50, 100, 100, 100, 200, 200])
    expect(dayQuotas(dates, TUE_HALF, 851).reduce((a, b) => a + b, 0)).toBe(851)
    expect(dayQuotas(dates, [0, 0, 0, 0, 0, 0, 0], 10)).toEqual([0, 0, 0, 0, 0, 0, 0])
  })
})

describe('coverPlan', () => {
  const types = [
    { ref: 'A.1', label: 'a1', skill: 'A', skillName: 'Alpha', section: 'RW' as const },
    { ref: 'A.2', label: 'a2', skill: 'A', skillName: 'Alpha', section: 'RW' as const },
    { ref: 'B.1', label: 'b1', skill: 'B', skillName: 'Beta', section: 'MATH' as const },
  ]
  const unseen = new Map([['A.1', 120], ['A.2', 0], ['B.1', 80]])
  const plan = () => coverPlan(
    { ...answers({ test_date: '2026-11-03' }), mode: 'cover', weights: TUE_HALF },
    { today: '2026-10-26', types, unseen, now: 1, newId: () => `c${n++}` })

  it('covers every unseen question once, in type order, within each day\'s quota', () => {
    const p = plan()
    const quotas = dayQuotas(p.sessions.map((s) => s.date), TUE_HALF, 200)
    expect(p.sessions.map((s) => s.filters.size)).toEqual(quotas.filter(Boolean))
    const flat = p.sessions.flatMap((s) => s.parts!)
    expect(flat.reduce((a, x) => a + x.n, 0)).toBe(200)
    expect(flat.filter((x) => x.ref === 'A.1').reduce((a, x) => a + x.n, 0)).toBe(120)
    expect(flat.some((x) => x.ref === 'A.2')).toBe(false)
    // A.1 runs out partway through a day and B.1 carries on in the same session.
    const split = p.sessions.find((s) => s.parts!.length > 1)!
    expect(split.parts!.map((x) => x.ref)).toEqual(['A.1', 'B.1'])
    expect(split.filters).toMatchObject({ statuses: ['unseen'], types: ['A.1', 'B.1'], skills: ['A', 'B'] })
    expect(split.title).toBe('Alpha + 1 more skill · 2 types')
  })

  it('spreads missed questions over the days left, losing none', () => {
    const p = plan()
    const r = reflow(p, '2026-10-28')
    const left = r.sessions.filter((s) => s.date >= '2026-10-28')
    expect(left.reduce((a, s) => a + (s.filters.size ?? 0), 0)).toBe(200)
    expect(r.sessions.every((s) => s.date >= '2026-10-28')).toBe(true)
  })
})

describe('weights in the skill planner', () => {
  it('practises only weighted days and sizes sessions by weight', () => {
    const p = buildPlan(answers({ weights: TUE_HALF, minutes: 30 }), ctx({ estimate: { rw: 600, math: 600 } }))
    const byDay = (dow: number) => p.sessions.filter((s) => new Date(`${s.date}T00:00:00`).getDay() === dow && s.phase === 'build')
    expect(byDay(6)[0]!.filters.size).toBe(30)
    expect(byDay(1)[0]!.filters.size).toBe(15)
    expect(byDay(2)[0]!.filters.size).toBe(10)
    expect(p.days).toEqual([0, 1, 2, 3, 4, 5, 6])
  })
})

describe('a day of process types', () => {
  const day = (): Plan => ({
    test_date: '2026-11-07', target: null, days: [], minutes: 30, start_from: 'estimate', focus: 'auto',
    mode: 'cover', created_at: 1, source: 'auto',
    sessions: [{
      id: 'd', date: '2026-10-21', phase: 'cover', title: 'A + 1 more skill · 2 types',
      filters: { size: 7 },
      parts: [
        { ref: 'A.1', label: 'a1', skill: 'A', skillName: 'Alpha', n: 5 },
        { ref: 'B.1', label: 'b1', skill: 'B', skillName: 'Beta', n: 2 },
      ],
    }],
  })

  it('ticks a type off when its own set finishes, and the day when all are done', () => {
    let p = patchPart(day(), 'd', 'A.1', { set_id: 'sa' })
    p = markFinished(p, new Map([['sa', 10]]))
    const s = p.sessions[0]!
    expect(s.parts![0]!.done_at).toBe(10)
    expect(s.done_at).toBeUndefined()
    expect(nextPart(s)!.ref).toBe('B.1')
    p = patchPart(p, 'd', 'B.1', { set_id: 'sb' })
    p = markFinished(p, new Map([['sb', 20]]))
    expect(p.sessions[0]!.done_at).toBe(20)
    expect(nextPart(p.sessions[0]!)).toBeNull()
  })

  it('un-marking a type reopens the day', () => {
    let p = togglePart(day(), 'd', 'A.1', 5)
    p = togglePart(p, 'd', 'B.1', 6)
    expect(p.sessions[0]!.done_at).toBe(6)
    p = togglePart(p, 'd', 'B.1', 7)
    expect(p.sessions[0]!.done_at).toBeUndefined()
    expect(p.sessions[0]!.parts![1]!.done_at).toBeUndefined()
  })
})

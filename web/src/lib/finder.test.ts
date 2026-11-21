import { describe, expect, it } from 'vitest'
import { analyzeFinder, buildFinder, finderPlan, isFinderSet, type FinderAnswer, type WeakType } from './finder'
import type { ProcessTypes } from './similar'
import type { Difficulty, Section, SetItem } from '../types'

let n = 0
function q(skill: string, difficulty: Difficulty, over: Partial<SetItem> = {}): SetItem {
  n++
  const section: Section = skill === 'WIC' || skill === 'SYN' ? 'RW' : 'MATH'
  return {
    id: `q${n}`, cb_id: `c${n}`, section,
    domain: section === 'RW' ? 'CAS' : 'H', domain_name: section === 'RW' ? 'Craft and Structure' : 'Algebra',
    skill, skill_name: skill, difficulty, band: null, type: 'mcq',
    last_correct: null, last_seconds: null, last_response: null, answered_at: null, flagged: 0, attempt_count: 0,
    ...over,
  }
}

function typesFor(items: [SetItem, string][]): ProcessTypes {
  const pt: ProcessTypes = { types: {}, q: {} }
  for (const [item, ref] of items) {
    pt.q[item.cb_id!] = ref
    const dot = ref.lastIndexOf('.')
    pt.types[ref.slice(0, dot)] = { ...pt.types[ref.slice(0, dot)], [ref.slice(dot + 1)]: { label: `L ${ref}`, how: `H ${ref}` } }
  }
  return pt
}

describe('buildFinder', () => {
  it('takes one question per type and difficulty, unseen first, R&W sets first', () => {
    const seen = q('H.A.', 'E', { last_correct: 1 })
    const fresh = q('H.A.', 'E')
    const hard = q('H.A.', 'H')
    const wic = q('WIC', 'M')
    const untyped = q('H.A.', 'M')
    const pt = typesFor([[seen, 'H.A..solve'], [fresh, 'H.A..solve'], [hard, 'H.A..solve'], [wic, 'WIC.meaning']])
    const drafts = buildFinder([seen, fresh, hard, wic, untyped], pt, () => 0)
    expect(drafts.map((d) => d.filters.title)).toEqual(['Weakness finder: Craft and Structure', 'Weakness finder: Algebra'])
    expect(drafts[0]!.ids).toEqual([wic.id])
    expect([...drafts[1]!.ids].sort()).toEqual([fresh.id, hard.id].sort())
    expect(drafts[1]!.filters).toMatchObject({ section: 'MATH', skills: ['H.A.'], size: 2 })
    expect(isFinderSet(drafts[1]!)).toBe(true)
    expect(isFinderSet({ filters: { title: 'Score check' } })).toBe(false)
  })

  it('a seen question stands in when the cell has nothing unseen', () => {
    const seen = q('H.A.', 'E', { last_correct: 0 })
    const drafts = buildFinder([seen], typesFor([[seen, 'H.A..solve']]))
    expect(drafts[0]!.ids).toEqual([seen.id])
  })

  it('splits a big domain into even sets of at most 45', () => {
    const items = Array.from({ length: 100 }, (_, i) => q('H.A.', 'E', { cb_id: `big${i}` }))
    const pt = typesFor(items.map((it, i) => [it, `H.A..t${i}`]))
    const drafts = buildFinder(items, pt)
    expect(drafts.map((d) => d.ids.length)).toEqual([34, 34, 32])
    expect(drafts[2]!.filters.title).toBe('Weakness finder: Algebra (3/3)')
    expect(new Set(drafts.flatMap((d) => d.ids)).size).toBe(100)
  })
})

describe('analyzeFinder', () => {
  const easy = q('H.A.', 'E'), hard = q('H.A.', 'H'), slowRight = q('WIC', 'M'), idle = q('WIC', 'E'), fine = q('SYN', 'M')
  const pt = typesFor([[easy, 'H.A..solve'], [hard, 'H.A..solve'], [slowRight, 'WIC.meaning'], [idle, 'WIC.tone'], [fine, 'SYN.goal']])
  const answers: FinderAnswer[] = [
    { q: easy, correct: false, seconds: 40 },
    { q: hard, correct: false, seconds: 100 },
    { q: slowRight, correct: true, seconds: 120 }, // 120/71 > 1.5: slow
    { q: idle, correct: false, seconds: 5000 }, // capped at 3x pace
    { q: fine, correct: true, seconds: 50 },
  ]
  const r = analyzeFinder(answers, pt)

  it('weights misses by difficulty and counts slow right answers as half', () => {
    expect(r.weak.map((w) => [w.ref, w.lost])).toEqual([['H.A..solve', 4], ['WIC.tone', 1], ['WIC.meaning', 0.5]])
    expect(r.weak[0]).toMatchObject({ hardMiss: 1, careless: 1, slow: 0, accuracy: 0, label: 'L H.A..solve', how: 'H H.A..solve' })
    expect(r.weak.find((w) => w.ref === 'WIC.meaning')!.slow).toBe(1)
    expect(r.weak.some((w) => w.ref === 'SYN.goal')).toBe(false)
  })

  it('caps idle time at three times the pace', () => {
    expect(r.weak.find((w) => w.ref === 'WIC.tone')!.pace).toBe(3)
  })

  it('rolls up by difficulty and by domain, worst domain first', () => {
    expect(r.answered).toBe(5)
    expect(r.byDifficulty.map((g) => `${g.section} ${g.name} ${g.n}`)).toEqual(['MATH Easy 1', 'MATH Hard 1', 'RW Easy 1', 'RW Medium 2'])
    expect(r.byDomain[0]).toMatchObject({ name: 'Algebra', lostPerQ: 2, accuracy: 0 })
  })
})

describe('finderPlan', () => {
  const w = (ref: string, section: Section): WeakType => ({
    ref, label: ref, how: '', section, skill: '', skillName: '', n: 1, accuracy: 0, pace: 1, lost: 1, hardMiss: 0, careless: 0, slow: 0,
  })
  const weak = [w('r1', 'RW'), w('r2', 'RW'), w('r3', 'RW'), w('m1', 'MATH'), w('m2', 'MATH'), w('r4', 'RW')]
  const now = new Date(2026, 10, 21, 15)

  it('runs from tomorrow to the day before the test, redo then light at the end', () => {
    const { days, extra } = finderPlan(weak, '2026-12-05', now)
    expect(days[0]!.date).toBe('2026-11-22')
    expect(days.at(-1)).toMatchObject({ date: '2026-12-04', kind: 'light', types: [] })
    expect(days.at(-2)!.kind).toBe('redo')
    expect(days[0]!.types.map((t) => t.ref)).toEqual(['r1', 'r2', 'm1', 'r3', 'r4', 'm2'])
    expect(extra).toEqual([])
  })

  it('uses 14 days with no test date and returns what does not fit', () => {
    const many = Array.from({ length: 100 }, (_, i) => w(`x${i}`, 'RW'))
    const { days, extra } = finderPlan(many, null, now)
    expect(days).toHaveLength(14)
    expect(extra).toHaveLength(100 - 12 * 6)
  })

  it('falls back to 14 days when no day is left before the test', () => {
    for (const date of ['2026-11-22', '2026-11-21', '2026-11-01']) {
      const p = finderPlan(weak, date, now)
      expect(p.days).toHaveLength(14)
      expect(p.fitted).toBe(false)
    }
    expect(finderPlan(weak, '2026-12-05', now).fitted).toBe(true)
  })
})

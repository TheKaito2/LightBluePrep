import { describe, expect, it } from 'vitest'
import { focusSkills, rollup } from './taxonomy'
import type { Difficulty, Section, TaxonomyRow } from '../types'

const row = (section: Section, domain: string, skill: string, difficulty: Difficulty,
  n: number, seen: number, correct: number): TaxonomyRow => ({
  section, domain, domain_name: `${domain} name`, skill, skill_name: `${skill} name`,
  difficulty, n, live_n: 0, seen, correct,
})

const ROWS = [
  row('RW', 'INI', 'CID', 'E', 40, 6, 3),
  row('RW', 'INI', 'CID', 'H', 20, 6, 3),
  row('RW', 'EOI', 'TRA', 'M', 50, 5, 5),
  row('RW', 'SEC', 'BOU', 'E', 30, 4, 0),
  row('MATH', 'H', 'H.A.', 'M', 60, 8, 5),
  row('MATH', 'P', 'P.B.', 'H', 25, 0, 0),
]

describe('rollup', () => {
  it('is all zeros for no rows', () => {
    const r = rollup([])
    expect(r.total).toEqual({ n: 0, seen: 0, correct: 0 })
    expect(r.sections.RW).toEqual({ n: 0, seen: 0, correct: 0 })
    expect(r.difficulty.H).toEqual({ n: 0, seen: 0, correct: 0 })
    expect(r.domains).toEqual([])
    expect(r.skills).toEqual([])
  })

  it('sums each level and nests skills under their domain', () => {
    const r = rollup(ROWS)
    expect(r.total).toEqual({ n: 225, seen: 29, correct: 16 })
    expect(r.sections.MATH).toEqual({ n: 85, seen: 8, correct: 5 })
    expect(r.difficulty.E).toEqual({ n: 70, seen: 10, correct: 3 })
    const ini = r.domains.find((d) => d.code === 'INI')!
    expect(ini.skills.map((k) => [k.code, k.n, k.seen, k.correct])).toEqual([['CID', 60, 12, 6]])
    expect(r.domains.map((d) => d.section)).toEqual(['RW', 'RW', 'RW', 'MATH', 'MATH'])
    expect(r.skills).toHaveLength(5)
  })

  it('keeps only one section when asked', () => {
    const r = rollup(ROWS, 'MATH')
    expect(r.total).toEqual({ n: 85, seen: 8, correct: 5 })
    expect(r.sections.RW).toEqual({ n: 0, seen: 0, correct: 0 })
    expect(r.domains.map((d) => d.code).sort()).toEqual(['H', 'P'])
    expect(r.skills.every((k) => k.section === 'MATH')).toBe(true)
  })
})

describe('focusSkills', () => {
  it('ranks weak skills by questions lost, leaving out thin and strong ones', () => {
    const focus = focusSkills(rollup(ROWS).skills)
    // CID lost 6 of 12, H.A. lost 3 of 8. TRA is 100% and BOU has only 4 answers.
    expect(focus.map((k) => k.code)).toEqual(['CID', 'H.A.'])
  })

  it('breaks a tie on questions lost by accuracy, and caps the list', () => {
    const skills = [
      { code: 'a', n: 10, seen: 10, correct: 7 },
      { code: 'b', n: 10, seen: 5, correct: 2 },
      { code: 'c', n: 10, seen: 6, correct: 4 },
    ]
    expect(focusSkills(skills).map((k) => k.code)).toEqual(['b', 'a', 'c'])
    expect(focusSkills(skills, 5, 2)).toHaveLength(2)
    expect(focusSkills(skills, 7).map((k) => k.code)).toEqual(['a'])
  })
})

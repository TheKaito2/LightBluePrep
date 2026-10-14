import { describe, expect, it } from 'vitest'
import { arrange } from './order'
import type { SetItem } from '../types'

function item(id: string, section: 'RW' | 'MATH', domain: string, skill: string,
              difficulty: 'E' | 'M' | 'H'): SetItem {
  return {
    id, section, domain, domain_name: domain, skill, skill_name: skill, difficulty,
    band: null, type: 'mcq', last_correct: null, last_seconds: null,
    last_response: null, answered_at: null, flagged: 0, attempt_count: 0,
  }
}

const pool = [
  item('a', 'MATH', 'Algebra', 'Linear', 'H'),
  item('b', 'RW', 'Craft', 'Words', 'M'),
  item('c', 'MATH', 'Algebra', 'Linear', 'E'),
  item('d', 'MATH', 'Advanced', 'Quadratics', 'M'),
  ...Array.from({ length: 40 }, (_, i) => item(`x${i}`, 'RW', 'Craft', 'Words', 'E')),
]

describe('arrange', () => {
  it('groups by topic, Reading first, easy to hard', () => {
    const ids = arrange(pool, 'topic').map((q) => q.id).filter((id) => !id.startsWith('x'))
    expect(ids).toEqual(['b', 'd', 'c', 'a'])
  })

  it('follows College Board order for real codes, not the alphabet', () => {
    const real = [
      { ...item('m1', 'MATH', 'P', 'P.A.', 'E'), domain_name: 'Advanced Math' },
      { ...item('m2', 'MATH', 'H', 'H.B.', 'E'), domain_name: 'Algebra' },
      { ...item('r1', 'RW', 'CAS', 'CTC', 'E'), domain_name: 'Craft and Structure' },
      { ...item('r2', 'RW', 'CAS', 'WIC', 'E'), domain_name: 'Craft and Structure' },
      { ...item('r3', 'RW', 'INI', 'CID', 'E'), domain_name: 'Information and Ideas' },
    ]
    expect(arrange(real, 'topic').map((q) => q.id)).toEqual(['r3', 'r2', 'r1', 'm2', 'm1'])
  })

  it('random is stable for one seed and differs across seeds', () => {
    const one = arrange(pool, 'random', 's1').map((q) => q.id)
    expect(arrange(pool, 'random', 's1').map((q) => q.id)).toEqual(one)
    expect(arrange(pool, 'random', 's2').map((q) => q.id)).not.toEqual(one)
  })

  it('mixed restores the same order whatever came in', () => {
    const shuffled = arrange(pool, 'random', 'zz')
    expect(arrange(shuffled, 'mixed').map((q) => q.id))
      .toEqual(arrange(pool, 'mixed').map((q) => q.id))
  })

  it('never mutates its input', () => {
    const before = pool.map((q) => q.id)
    arrange(pool, 'topic')
    expect(pool.map((q) => q.id)).toEqual(before)
  })
})

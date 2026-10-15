import { describe, expect, it } from 'vitest'
import { filterByTypes, invertTypes, similarTo, typeOf, type ProcessTypes } from './similar'
import type { SetItem } from '../types'

function item(id: string, skill: string, band: number, last: number | null): SetItem {
  return {
    id, cb_id: `cb-${id}`, section: 'MATH', domain: 'D', domain_name: 'D', skill, skill_name: skill,
    difficulty: 'M', band, type: 'mcq', last_correct: last, last_seconds: null,
    last_response: null, answered_at: last === null ? null : 1, flagged: 0, attempt_count: last === null ? 0 : 1,
  }
}

const pt: ProcessTypes = {
  types: { 'H.A.': { k: { label: 'Find the constant', how: 'Plug in' }, s: { label: 'Solve', how: 'Isolate x' } } },
  q: { 'cb-me': 'H.A..k', 'cb-a': 'H.A..k', 'cb-b': 'H.A..k', 'cb-c': 'H.A..k', 'cb-d': 'H.A..k', 'cb-z': 'H.A..s' },
}

describe('similarTo', () => {
  const me = item('me', 'H.A.', 4, 0)
  const pool = [me, item('a', 'H.A.', 4, 1), item('b', 'H.A.', 6, null), item('c', 'H.A.', 4, 0),
    item('d', 'H.A.', 4, null), item('z', 'H.A.', 4, null)]

  it('keeps only the same type, never the question itself', () => {
    const ids = similarTo(me, pool, pt).map((q) => q.id)
    expect(ids).not.toContain('me')
    expect(ids).not.toContain('z')
  })

  it('orders unseen, then wrong, then right; closest band first', () => {
    expect(similarTo(me, pool, pt).map((q) => q.id)).toEqual(['d', 'b', 'c', 'a'])
  })

  it('falls back to the whole skill when the type is too small', () => {
    const lonely = item('z', 'H.A.', 4, 0)
    expect(similarTo(lonely, pool, pt).map((q) => q.id)).toContain('a')
  })

  it('reads a skill code that itself contains dots', () => {
    expect(typeOf('cb-me', pt)?.label).toBe('Find the constant')
  })
})

describe('filterByTypes', () => {
  const pool = [item('a', 'H.A.', 4, null), item('z', 'H.A.', 4, null), item('q', 'P.A.', 4, null)]

  it('narrows only the skill whose type was picked', () => {
    expect(filterByTypes(pool, ['H.A..s'], pt).map((q) => q.id)).toEqual(['z', 'q'])
  })
})

describe('invertTypes', () => {
  it('turns the grouped file back into one entry per question', () => {
    const file = { types: pt.types, q: { 'H.A..k': ['cb-me', 'cb-a', 'cb-b', 'cb-c', 'cb-d'], 'H.A..s': ['cb-z'] } }
    expect(invertTypes(file)).toEqual(pt)
  })

  it('still reads the older per-question file a browser may have cached', () => {
    expect(invertTypes(pt)).toEqual(pt)
  })
})

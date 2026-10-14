// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FILTERS_KEY, ORDER_KEY, loadFilters, loadOrder, parseFilters, saveFilters, saveOrder } from './prefs'

afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })

describe('home prefs', () => {
  it('round-trips the picks and drops set-only fields', () => {
    saveFilters({ skills: ['WIC'], domains: ['CAS'], difficulties: ['H'], size: 20, speed: 1.5, title: 'Score check', skill_names: ['x'] })
    expect(loadFilters()).toEqual({ skills: ['WIC'], domains: ['CAS'], difficulties: ['H'], size: 20, speed: 1.5 })
  })

  it('is null on a first visit, and on junk', () => {
    expect(loadFilters()).toBeNull()
    localStorage.setItem(FILTERS_KEY, '{oops')
    expect(loadFilters()).toBeNull()
    expect(parseFilters([1])).toBeNull()
  })

  it('drops values this build does not offer', () => {
    expect(parseFilters({ size: 7, speed: 3, section: 'X', difficulties: ['Z'], statuses: [], skills: [1] }))
      .toEqual({})
  })

  it('keeps a reshuffle seed only with the random order', () => {
    expect(loadOrder()).toEqual({ order: 'mixed', seed: '' })
    saveOrder({ order: 'random', seed: 'abc' })
    expect(loadOrder()).toEqual({ order: 'random', seed: 'abc' })
    localStorage.setItem(ORDER_KEY, JSON.stringify({ order: 'topic', seed: 'abc' }))
    expect(loadOrder()).toEqual({ order: 'topic', seed: '' })
  })

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(() => saveFilters({ size: 10 })).not.toThrow()
    expect(loadFilters()).toBeNull()
    expect(loadOrder().order).toBe('mixed')
  })
})

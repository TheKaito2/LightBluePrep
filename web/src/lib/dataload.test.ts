// @vitest-environment jsdom
/**
 * The static backend's data layer (PF-02, PF-04, PF-17): a question opened
 * while its prefetch is on the wire is fetched once, a first visit does not
 * wait on storing the index or on the practice-test list, and the ID search
 * returns a handful of rows rather than the bank.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Annotation } from '../types'

const never = new Promise<never>(() => {})
const calls = { detail: 0, lookupStarted: false }
let releaseIndex: () => void = () => {}
/** The annotations store, kept so a save can be read back like a reload would. */
const saved = new Map<string, { question_id: string; items: unknown[] }>()

vi.mock('./cbApi', () => ({
  fetchIndex: () => new Promise((resolve) => {
    releaseIndex = () => resolve([
      { _id: 'a', _path: 'external_id', _section: 'MATH', questionId: 'abc12345' },
      { _id: 'b', _path: 'external_id', _section: 'MATH', questionId: 'abc1' },
      { _id: 'c', _path: 'ibn', _section: 'RW', questionId: 'ffff0000' },
    ])
  }),
  fetchLiveItems: async () => { calls.lookupStarted = true; return { RW: [], MATH: [] } },
  fetchDetail: async (stub: { _id: string }) => {
    calls.detail++
    await new Promise((r) => setTimeout(r, 20))
    return { id: stub._id }
  },
}))
vi.mock('./normalize', () => ({
  normaliseQuestion: (stub: { _id: string }) => ({ id: stub._id, correct: ['A'] }),
}))
vi.mock('./store', () => ({
  loadIndex: async () => [],
  // Storing the index never finishes: nothing may wait on it.
  saveIndex: () => never,
  getMeta: async () => undefined,
  setMeta: async () => {},
  loadAttempts: async () => [],
  loadMarks: async () => [],
  loadQuestion: async () => undefined,
  saveQuestion: async () => {},
  loadAnnotations: async (id: string) => saved.get(id),
  saveAnnotations: async (id: string, items: unknown[]) => { saved.set(id, { question_id: id, items }) },
  loadMistake: async () => undefined,
  isEmptyMistake: () => true,
}))

const local = await import('../apiLocal')
const { nextAnnotationId } = await import('./ranges')

describe('static backend data layer', () => {
  beforeEach(() => { calls.detail = 0 })

  it('boots with the index alone, not waiting on the lookup or the save', async () => {
    const booted = local.taxonomy()
    // The practice-test list is on the wire before the index lands, not after.
    await new Promise((r) => setTimeout(r, 0))
    expect(calls.lookupStarted).toBe(true)
    releaseIndex()
    const { taxonomy } = await booted
    expect(taxonomy.reduce((n, r) => n + r.n, 0)).toBe(3)
  })

  it('shares an in-flight fetch between a prefetch and an open', async () => {
    local.prefetch(['a', 'b'])
    const opened = await local.question('a')
    expect(opened.question.id).toBe('a')
    // The answer key is still kept out of what React gets.
    expect('correct' in opened.question).toBe(false)
    await new Promise((r) => setTimeout(r, 40))
    expect(calls.detail).toBe(2)
  })

  it('finds by College Board ID: exact first, at most 5, with the total', async () => {
    const found = await local.findByCbId('abc1')
    expect(found.total).toBe(2)
    expect(found.hits.map((h) => h.cb_id)).toEqual(['abc1', 'abc12345'])
    const many = local.rankByCbId(Array.from({ length: 9 }, (_, i) => `x${9 - i}`), (s) => s, 'x')
    expect(many).toEqual({ hits: ['x1', 'x2', 'x3', 'x4', 'x5'], total: 9 })
  })

  it('keeps highlight ids stable across a removal and a reload', async () => {
    let list: Annotation[] = []
    // As the editor does it: each new highlight is numbered before it is saved.
    for (const start of [0, 10, 20]) {
      const draft = { field: 'stem', start_offset: start, end_offset: start + 5, color: 'yellow', note: null }
      list = (await local.saveAnnotations('a', [...list, { ...draft, id: nextAnnotationId(list) }])).annotations
    }
    expect(list.map((x) => x.id)).toEqual([1, 2, 3])
    await local.saveAnnotations('a', list.filter((x) => x.id !== 2))
    const reloaded = (await local.question('a')).annotations
    expect(reloaded.map((x) => [x.id, x.start_offset])).toEqual([[1, 0], [3, 20]])
    // A new one after the gap takes 4, not 3 (the length plus one).
    expect(nextAnnotationId(reloaded)).toBe(4)
  })

  it('renumbers a missing or repeated highlight id past the highest', async () => {
    const base = { field: 'stem', start_offset: 0, end_offset: 4, color: 'yellow', note: null }
    const sent = [{ ...base, id: 5 }, { ...base, id: 5 }, { ...base } as Annotation, { ...base, id: 2 }]
    const { annotations } = await local.saveAnnotations('b', sent)
    expect(annotations.map((x) => x.id)).toEqual([5, 6, 7, 2])
  })
})

// @vitest-environment jsdom
/**
 * The practice-set lifecycle, the logic with the longest list of past
 * regressions: lost answers, time refunded on reload, a finish that graded
 * twice. The pure steps first, then the hook's finish end to end.
 */
import { act, createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { commitItem, gradeItems, holdItem, newSet, sumSeconds, type GradedCache } from './sets'
import { usePracticeSet, type PracticeSetApi } from './usePracticeSet'
import type { View } from './route'
import type { PracticeSet, SetAnswer, SetItem } from '../types'

const saved: PracticeSet[] = []
vi.mock('../api', () => ({
  saveSet: vi.fn(async (row: Omit<PracticeSet, 'updated_at' | 'total' | 'answered' | 'correct'>) => {
    const items = row.items ?? []
    const set = {
      ...row, updated_at: 0, total: items.length,
      answered: items.filter((i) => i.response).length,
      correct: items.filter((i) => i.correct).length,
    }
    saved.push(set)
    return set
  }),
  // A slow grader, so a second Finish lands while the first is still grading.
  answer: vi.fn(async (_id: string, response: string) => {
    await new Promise((r) => setTimeout(r, 10))
    return { correct: response === 'A' }
  }),
  listSets: vi.fn(async () => []),
}))

const row = (question_id: string, response: string | null = null, seconds = 0): SetAnswer =>
  ({ question_id, response, correct: 0, seconds })

describe('set steps', () => {
  it('builds a fresh set in the given order', () => {
    const set = newSet({ size: 2 }, ['a', 'b'])
    expect(set.items.map((i) => i.question_id)).toEqual(['a', 'b'])
    expect(set.items.every((i) => i.response === null && i.seconds === 0)).toBe(true)
    expect(set).toMatchObject({ finished_at: null, seconds: 0, filters: { size: 2 } })
  })

  it('hold replaces the held response and leaves the others alone', () => {
    const items = [row('a', 'B', 10), row('b', 'C', 4)]
    const next = holdItem(items, 'a', 'D', 12)
    expect(next[0]).toMatchObject({ response: 'D', seconds: 12 })
    expect(next[1]).toBe(items[1])
    expect(holdItem(next, 'a', null, 12)[0]!.response).toBeNull()
  })

  it('never lowers a question\'s time', () => {
    const items = [row('a', 'B', 30)]
    expect(holdItem(items, 'a', 'C', 5)[0]!.seconds).toBe(30)
    expect(commitItem(items, 'a', 30)).toBeNull()
    expect(commitItem(items, 'a', 12)).toBeNull()
    expect(commitItem(items, 'a', 31)?.[0]?.seconds).toBe(31)
    expect(commitItem(items, 'missing', 99)).toBeNull()
  })

  it('keeps the set clock equal to the questions\' own times', () => {
    let items = [row('a'), row('b'), row('c')]
    items = commitItem(items, 'a', 40)!
    items = holdItem(items, 'b', 'A', 25)
    items = commitItem(items, 'a', 55)!
    expect(sumSeconds(items)).toBe(55 + 25 + 0)
  })

  it('grades only answered items: a blank is never sent and scores 0', async () => {
    const answer = vi.fn(async (_id: string, response: string) => ({ correct: response === 'A' }))
    const items = [row('a', 'A', 3), row('b', null), row('c', ''), row('d', 'B', 7)]
    const { items: graded, failure } = await gradeItems('s', items, answer, new Map())
    expect(failure).toBeNull()
    expect(answer.mock.calls).toEqual([['a', 'A', 3], ['d', 'B', 7]])
    expect(graded.map((i) => i.correct)).toEqual([1, 0, 0, 0])
  })

  it('a retry after a failed grade records only what is missing', async () => {
    const cache: GradedCache = new Map()
    const flaky = vi.fn(async (id: string) => {
      if (id === 'b') throw new Error('offline')
      return { correct: true }
    })
    const items = [row('a', 'A'), row('b', 'B')]
    const first = await gradeItems('s', items, flaky, cache)
    expect(first.failure).toBeInstanceOf(Error)
    expect(first.items[1]).toBe(items[1])
    const steady = vi.fn(async (_id: string) => ({ correct: false }))
    const second = await gradeItems('s', items, steady, cache)
    expect(steady.mock.calls.map((c) => c[0])).toEqual(['b'])
    expect(second.items.map((i) => i.correct)).toEqual([1, 0])
  })
})

describe('usePracticeSet finish', () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

  it('grades once and saves one finished set under a double call', async () => {
    const api = await import('../api')
    let hook!: PracticeSetApi
    let goTo!: (index: number) => void
    let view: View = 'home'
    function Probe() {
      const [items, setItems] = useState<SetItem[]>([])
      const [index, setIndex] = useState(0)
      const [shown, setView] = useState<View>('home')
      view = shown
      goTo = setIndex
      hook = usePracticeSet({
        view: shown, items, index, setItems, setIndex, navigate: setView, fail: (e) => { throw e }, dataVersion: 0,
      })
      return null
    }
    const root = createRoot(document.createElement('div'))
    await act(async () => root.render(createElement(Probe)))

    const pool = ['q1', 'q2', 'q3'].map((id) => ({ id, section: 'RW' }) as SetItem)
    await act(async () => { await hook.start(pool, { size: 3 }) })
    expect(view).toBe('practice')
    await act(async () => { hook.hold('A', 4) })
    await act(async () => { goTo(2) })
    await act(async () => { hook.hold('C', 6) })

    await act(async () => { await Promise.all([hook.finish(), hook.finish()]) })

    expect(vi.mocked(api.answer).mock.calls.map((c) => c[0])).toEqual(['q1', 'q3'])
    const finished = saved.filter((s) => s.finished_at !== null)
    expect(finished).toHaveLength(1)
    expect(finished[0]).toMatchObject({ answered: 2, correct: 1, seconds: 10 })
    expect(view).toBe('results')
    expect(hook.activeSet).toBeNull()
    expect(hook.shownSet?.id).toBe(finished[0]!.id)
    act(() => root.unmount())
  })
})

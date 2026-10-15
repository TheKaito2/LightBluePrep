/**
 * The pure half of a practice set's lifecycle: building one, holding answers,
 * banking time and grading at the end. usePracticeSet is the stateful half.
 */
import type { Filters, SetAnswer, SetItem } from '../types'

/** Now, in the Unix seconds every stored timestamp uses. */
export const nowSec = () => Math.floor(Date.now() / 1000)

/**
 * A new, unstarted set over these questions in this order. `filters` is what
 * names the set later, so it is stored as given.
 */
export function newSet(filters: Filters, ids: string[]) {
  return {
    id: crypto.randomUUID(),
    created_at: nowSec(),
    finished_at: null,
    seconds: 0,
    filters,
    items: ids.map((question_id): SetAnswer => ({ question_id, response: null, correct: 0, seconds: 0 })),
  }
}

/**
 * The set clock. It is the sum of the questions' own times rather than a
 * separate counter, so it survives a reload the same way the answers do.
 */
export const sumSeconds = (items: SetAnswer[]) => items.reduce((sum, i) => sum + (i.seconds || 0), 0)

/** Left blank: never graded, and never recorded as an attempt. */
export const isBlank = (item: SetAnswer) => item.response === null || item.response === ''

/**
 * Hold an answer. Nothing is graded and no attempt is recorded until the set
 * is finished, the same as a real module, so picking again just replaces what
 * is held. Its time can only grow.
 */
export function holdItem(items: SetAnswer[], id: string, response: string | null, seconds: number): SetAnswer[] {
  return items.map((i) => (
    i.question_id === id ? { ...i, response, seconds: Math.max(i.seconds || 0, seconds) } : i
  ))
}

/**
 * Bank `seconds` as a question's total time. Never lowers its figure, so
 * revisiting a question cannot hand time back: null when there is nothing to
 * write.
 */
export function commitItem(items: SetAnswer[], id: string, seconds: number): SetAnswer[] | null {
  const row = items.find((i) => i.question_id === id)
  if (!row || seconds <= (row.seconds || 0)) return null
  return items.map((i) => (i.question_id === id ? { ...i, seconds } : i))
}

/** What a finish already graded, keyed by set and question, with the answer it was for. */
export type GradedCache = Map<string, { response: string; correct: 0 | 1 }>

/**
 * Grade every answered item, recording one attempt each through `answer`.
 *
 * A grade that a failed finish already recorded is reused while its answer is
 * unchanged, so a retry cannot record an attempt twice. A question that could
 * not be graded is not wrong: it comes back as it was, with the failure.
 */
export async function gradeItems(
  setId: string,
  items: SetAnswer[],
  answer: (id: string, response: string, seconds: number) => Promise<{ correct: boolean }>,
  graded: GradedCache,
): Promise<{ items: SetAnswer[]; failure: unknown }> {
  let failure: unknown = null
  const out = await Promise.all(items.map(async (i): Promise<SetAnswer> => {
    if (i.response === null || i.response === '') return { ...i, correct: 0 }
    const key = `${setId}:${i.question_id}`
    const done = graded.get(key)
    if (done?.response === i.response) return { ...i, correct: done.correct }
    try {
      const r = await answer(i.question_id, i.response, i.seconds || 0)
      const correct = r.correct ? 1 : 0
      graded.set(key, { response: i.response, correct })
      return { ...i, correct }
    } catch (e) { failure = e; return i }
  }))
  return { items: out, failure }
}

export type CellState = 'unanswered' | 'answered' | 'first' | 'retry' | 'wrong'

/**
 * White until you answer, green if you got it first time, yellow if it took
 * more than one go, red if your latest attempt was wrong.
 */
export function cellState(item: SetItem): CellState {
  const attempts = item.attempt_count ?? 0
  if (!attempts || item.last_correct === null) return 'unanswered'
  if (item.last_correct === 0) return 'wrong'
  return attempts > 1 ? 'retry' : 'first'
}

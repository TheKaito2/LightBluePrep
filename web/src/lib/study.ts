/**
 * The study row: the goal (lib/goal.ts) and the plan (lib/plan.ts), kept as
 * ONE record so they sync together and the plan reads its test date and
 * target from the same place the score card does.
 *
 * Stored in meta under STUDY_KEY with an updated_at, last write wins, like a
 * mark. Signed in, every save is queued for sync ('study:me'). Before this row
 * existed the goal lived alone under GOAL_KEY; that is read once as a fallback.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import * as api from '../api'
import * as store from './store'
import * as sync from './sync'
import type { Goal } from './goal'
import { markAnswered, markFinished, type AnsweredQuestion, type Plan } from './plan'
import { loadProcessTypes } from './similar'

export interface Study { goal: Goal | null; plan: Plan | null; updated_at: number }

const EMPTY: Study = { goal: null, plan: null, updated_at: 0 }

export async function loadStudy(): Promise<Study> {
  const row = await store.loadStudy()
  if (row) return row as Study
  const legacy = await store.getMeta<Goal>(store.GOAL_KEY)
  return legacy ? { ...EMPTY, goal: legacy } : EMPTY
}

const listeners = new Set<() => void>()
let version = 0
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
const getVersion = () => version

/** Change the goal, the plan or both; the other half is kept as stored. */
export async function saveStudy(patch: Partial<Pick<Study, 'goal' | 'plan'>>): Promise<Study> {
  const current = await loadStudy()
  const saved = await store.saveStudy({ goal: current.goal, plan: current.plan, ...patch }) as Study
  sync.track('study', 'me')
  version++
  for (const l of listeners) l()
  return saved
}

/**
 * The stored row. Re-read after a save and after any progress change, which is
 * how a sync pull, a restore or a delete in Settings reaches the screen.
 */
export function useStudy(): Study & { loaded: boolean } {
  const saved = useSyncExternalStore(subscribe, getVersion)
  const progress = useSyncExternalStore(api.onProgress, api.progressVersion)
  // `loaded` stays false until the first read, so "no plan yet" never flashes
  // for someone who has one.
  const [study, setStudy] = useState<Study & { loaded: boolean }>({ ...EMPTY, loaded: false })
  useEffect(() => {
    let stale = false
    loadStudy().then((s) => { if (!stale) setStudy({ ...s, loaded: true }) })
      .catch(() => { if (!stale) setStudy({ ...EMPTY, loaded: true }) })
    return () => { stale = true }
  }, [saved, progress])
  return study
}

/** Save or clear the plan, keeping the goal as stored. */
export const savePlan = (plan: Plan | null) => saveStudy({ plan })

/** Every answered question with its type and answer times, and what each type has left. */
async function answersByQuestion() {
  const [byId, { history }, types] = await Promise.all([api.questionsById(), api.history(), loadProcessTypes()])
  const times = new Map<string, { first: number; last: number }>()
  // Oldest first, so the first seen is the first answer.
  for (const row of history) {
    const at = row.answered_at * 1000
    const t = times.get(row.question_id)
    if (t) t.last = at
    else times.set(row.question_id, { first: at, last: at })
  }
  const answered: AnsweredQuestion[] = []
  const unseen = new Map<string, number>()
  for (const q of byId.values()) {
    const type = q.cb_id ? types?.q[q.cb_id] : undefined
    const t = times.get(q.id)
    if (type) unseen.set(type, (unseen.get(type) ?? 0) + (t ? 0 : 1))
    if (t) {
      answered.push({
        id: q.id, section: q.section, domain: q.domain, skill: q.skill, difficulty: q.difficulty, type,
        first_at: t.first, last_at: t.last,
      })
    }
  }
  return { answered: answered.sort((a, b) => a.first_at - b.first_at), unseen: types ? unseen : null }
}

/**
 * Close every session or type whose set has finished, or whose questions have
 * been answered any other way. Runs when the Plan page or Home opens, so work
 * done anywhere (another device included) ticks it off. Writes only when
 * something changed.
 */
export async function closeFinishedSessions(): Promise<void> {
  if (!(await loadStudy()).plan) return
  const [sets, { answered, unseen }] = await Promise.all([api.listSets(false, 500), answersByQuestion()])
  const finished = new Map(sets.flatMap((x) => (x.finished_at ? [[x.id, x.finished_at] as const] : [])))
  // Read last, so a plan edit made during the reads above is not overwritten.
  const { plan } = await loadStudy()
  if (!plan) return
  const next = markAnswered(markFinished(plan, finished), answered, unseen)
  if (next !== plan) await saveStudy({ plan: next })
}
